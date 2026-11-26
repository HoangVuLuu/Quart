// What the local demo scripts share: the team (the same people as on staging), the one password, and a small
// "browser" that talks to the API the way the web app does. Local only: never point these at a real server.

export const api = process.env.QUART_API ?? "http://localhost:5080";
export const mailpit = process.env.QUART_MAILPIT ?? "http://localhost:8025";
export const password = "!apple1755";
export const workplaceName = "Presotea Montmorency";

/** The platform admin: creates workplaces, member of none. */
export const admin = {
  fullName: "Hoang Vu Luu",
  email: "hoang@demo.quart",
  language: "en",
};

/**
 * Philippe owns the workplace and works shifts. Everyone else joins with the code. Names, levels (five of each)
 * and French for Kym-Anh and Tony are as on staging; everyone wants 30 hours a week.
 */
export const team = [
  { fullName: "Philippe", email: "philippe@demo.quart", level: 3, owner: true },
  { fullName: "Kym-Anh", email: "kymanh@demo.quart", level: 3, language: "fr" },
  { fullName: "Jay", email: "jay@demo.quart", level: 3 },
  { fullName: "Noemie", email: "noemie@demo.quart", level: 3 },
  { fullName: "Aymen", email: "aymen@demo.quart", level: 3 },
  { fullName: "Tony", email: "tony@demo.quart", level: 2, language: "fr" },
  { fullName: "Cecilia", email: "cecilia@demo.quart", level: 2 },
  { fullName: "Lili", email: "lili@demo.quart", level: 2 },
  { fullName: "Wendy", email: "wendy@demo.quart", level: 2 },
  { fullName: "Jason", email: "jason@demo.quart", level: 2 },
  { fullName: "Emilie", email: "emilie@demo.quart", level: 1 },
  { fullName: "Joseph", email: "joseph@demo.quart", level: 1 },
  { fullName: "Cedric", email: "cedric@demo.quart", level: 1 },
  { fullName: "Selma", email: "selma@demo.quart", level: 1 },
  { fullName: "Ayman", email: "ayman@demo.quart", level: 1 },
].map((person) => ({ language: "en", hours: 30, ...person }));

/** One browser: its own cookies, and the anti-forgery header on every request (AD-025). */
export class Browser {
  cookies = new Map([["XSRF-TOKEN", "seed"]]);

  async send(method, path, body) {
    let response;
    try {
      response = await fetch(`${api}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-XSRF-TOKEN": "seed",
          Cookie: [...this.cookies]
            .map(([name, value]) => `${name}=${value}`)
            .join("; "),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error(
        `Cannot reach the app at ${api}. Start it first: scripts/dev/start.sh`,
      );
    }
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      this.cookies.set(
        pair.slice(0, pair.indexOf("=")),
        pair.slice(pair.indexOf("=") + 1),
      );
    }
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(
        `${method} ${path} answered ${response.status}: ${text}`,
      );
      error.status = response.status;
      throw error;
    }
    return text ? JSON.parse(text) : undefined;
  }

  get = (path) => this.send("GET", path);
  post = (path, body = {}) => this.send("POST", path, body);
}

export async function signIn(email) {
  const browser = new Browser();
  try {
    await browser.post("/api/auth/sign-in", { email, password });
  } catch (error) {
    if (error.status === 401 || error.status === 400) {
      throw new Error(
        `Cannot sign in as ${email}. Create the demo team first: node scripts/dev/seed.mjs`,
      );
    }
    throw error;
  }
  return browser;
}

/** The demo workplace, seen by its owner. */
export async function demoWorkplace(owner) {
  const mine = await owner.get("/api/workplaces");
  const found = mine.find((x) => x.name === workplaceName) ?? mine[0];
  if (!found)
    throw new Error(
      "Philippe has no workplace. Create the demo team first: node scripts/dev/seed.mjs",
    );
  return `/api/workplaces/${found.workplaceId}`;
}
