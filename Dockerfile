# syntax=docker/dockerfile:1
# One image serves both the API and the built web app from the same origin (spec 9.1, AD-024).

# ---- 1. Build the web app ----
FROM node:26-alpine AS web
WORKDIR /web
COPY src/web/package.json src/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY src/web/ ./
RUN npm run build

# ---- 2. Build and publish the API ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /repo
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/backend/ src/backend/
RUN dotnet restore src/backend/Quart.Api/Quart.Api.csproj
# CI passes the commit SHA so the home page can show exactly what is deployed.
ARG VERSION=0.0.0-local
# The OpenAPI document is written by CI's build and committed; the image does not need it.
RUN dotnet publish src/backend/Quart.Api/Quart.Api.csproj --configuration Release --no-restore \
    --output /app -p:Version=0.0.0 -p:InformationalVersion=${VERSION} -p:OpenApiGenerateDocuments=false

# ---- 3. Runtime ----
# "chiseled": no shell, no package manager, runs as a non-root user.
# "-extra": includes ICU and time zone data. Without ICU, .NET falls back to invariant culture and
# French dates in emails (fr-CA, FR-262) would silently come out wrong.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra AS runtime
# Links the package on GitHub Container Registry to this repository.
LABEL org.opencontainers.image.source=https://github.com/HoangVuLuu/Quart
WORKDIR /app
COPY --from=api /app ./
COPY --from=web /web/dist ./wwwroot
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Quart.Api.dll"]
