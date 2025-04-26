Welcome to **Blizz WebApp** — a lightweight World of Warcraft group creation and scheduling platform, built using HTML, CSS, avaScript, and Firebase.

Players can log in with their Battle.net account, view their level 80 characters, create groups, and apply to existing groups for Mythic+ dungeons and events.

---

**Features**

- **Battle.net OAuth Login**  
  Secure login using your Blizzard Battle.net account.

- **Character Profile Display**  
  View your WoW characters, including their name, class, level, and Mythic+ score.

- **Group Creation Modal** 
  Easily create a new group, select a character and role, and schedule an event.

- **Group Application Modal** 
  Apply to existing groups with a selected character and an optional note.

- **JWT-based Authentication**
  Tokens are stored in `localStorage` for API authentication.

- **Dynamic Frontend Routing**
  Page content updates dynamically based on URL hash (`#home`, `#login`, `#about`).

- **Firebase Hosting and Functions**
  Hosting is powered by Firebase, with serverless functions handling authentication and API requests.

---

**Tech Stack**

- **Frontend**:  
  - HTML5
  - CSS3
  - JavaScript (ES6+)

- **Backend**:
  - Node.js (Express via Firebase Functions)
  - Firebase Hosting
  - JWT Authentication
  - Battle.net OAuth 2.0

- **APIs**:
  - Blizzard World of Warcraft Community API (Profile, Media, Mythic+ Keystone data)


