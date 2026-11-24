using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quart.Modules.Identity.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SocialLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "facebook",
                schema: "identity",
                table: "user",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "instagram",
                schema: "identity",
                table: "user",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "share_social_links",
                schema: "identity",
                table: "user",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "facebook",
                schema: "identity",
                table: "user");

            migrationBuilder.DropColumn(
                name: "instagram",
                schema: "identity",
                table: "user");

            migrationBuilder.DropColumn(
                name: "share_social_links",
                schema: "identity",
                table: "user");
        }
    }
}
