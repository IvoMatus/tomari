# Tomari

<p align="center">
  <img src="images/creatures.gif" alt="Eight pixel-art creatures, one per session state: working, needs permission, asking you, compacting, done, asleep, error and closed" width="100%">
</p>

A floating strip on the edge of your Mac's screen with one animated pixel-art creature per Claude Code session. Each creature shows what its session is doing, and the ones waiting for you are hard to miss. Click a creature and its session opens in the Claude desktop app.

> **Not an official Anthropic project.** It is not affiliated with or endorsed by Anthropic. "Claude" is a trademark of Anthropic, PBC.

> **Early development.** Expect rough edges. macOS 14 or newer only.

## Fork: app de Claude o terminal (perch-terminal)

Este repositorio es un fork de [Tomari](https://github.com/elrincondeldev/tomari) (antes Perch, licencia MIT) que agrega una opción: dónde se abren las sesiones, el **host**. Hay dos:

| | `app` (la app de escritorio de Claude) | `ghostty` (terminales de Ghostty) |
|---|---|---|
| **Clic en una criatura** | Abre la sesión en la app, con su enlace `claude://`, o con `claude --desktop --resume` si la app no la conoce. | Enfoca el panel de Ghostty donde corre la sesión, buscando el tty del proceso de Claude (o el de un proceso padre, como la terminal de nvim). Si no lo encuentra, solo activa Ghostty. Nunca inicia ni reanuda una sesión. |
| **Sesión al frente** | La que la app registra en `~/Library/Logs/Claude/main.log`. | La terminal enfocada de la pestaña seleccionada de la ventana del frente, consultada por AppleScript con un `osascript` persistente que termina junto con el agente. |
| **Lista del +** | Las sesiones de la app que no están archivadas, corran o no. | Las sesiones vivas de `claude agents --json` cuyo cwd está bajo `~/cenco`. |
| **Sesiones que se siguen** | Todas las de `claude agents --json`. | Solo las de `~/cenco`. |
| **Hooks** | `~/.claude/settings.json` | `~/cenco/.claude/settings.json` |
| **Sesiones con el mismo nombre** | Son sesiones distintas: en la app cada una conserva su id. | Son la misma: al reabrir `claude -n composer` cambia el id, así que la nueva reemplaza a la cerrada. |

El modo `ghostty` necesita Ghostty 1.4 o más nuevo, por su AppleScript. Mientras no se elija un host, se usa `app`, como en el Tomari original.

### Cambiar de host

```bash
tomari host            # muestra el host guardado
tomari host ghostty    # o: tomari host app
```

También está en el menú de la barra: **Open Sessions In → Claude App / Ghostty**. En ambos casos el agente cambia en el momento, sin reiniciar: detiene el seguimiento de foco del host anterior, arranca el del nuevo y guarda la elección en el campo `host` de `config.json`. Si el agente no está corriendo, `tomari host` solo guarda la elección para el próximo arranque.

Cambiar de host no mueve los hooks. `tomari host` avisa si faltan en el archivo del host elegido; `tomari hooks` muestra cómo quedaría ese archivo, y `tomari hooks --install` y `--remove` lo modifican, con respaldo previo en `…/perch-terminal/backups`. Sin hooks, el estado de las sesiones sale solo del sondeo de `claude agents`, con menos detalle.

Para agregar otra terminal hay que implementar la interfaz `SessionHost` de [`agent/src/host.ts`](agent/src/host.ts), como hace [`ghostty-host.ts`](agent/src/ghostty-host.ts), y sumar su id a `SESSION_HOSTS` en `shared/protocol.ts` y a `SessionHost` en `Sources/TomariCore/Protocol.swift`.

### Qué más cambia respecto del original

- **Pins, personaje y color por nombre**: se guardan por nombre de sesión (`claude -n composer`), así que en Ghostty se conservan cuando la sesión se vuelve a abrir con otro id. En la app, el pin sigue a su sesión aunque la app le cambie el título. Dos sesiones con el mismo nombre comparten pin, personaje y color en ambos modos.
- **Color de Claude**: cada criatura usa el color de su sesión, que es su `/color` o, si no tiene, el `color:` del agente con que se abrió (`claude --agent`). Un color elegido en el menú gana; quitar el pin vuelve al de Claude. Se lee de archivos internos de Claude Code (`~/.claude/sessions/<pid>.json` y el transcript de la sesión); si cambian, las criaturas quedan con el color predeterminado. El rojo de Claude no está en el menú de colores.
- **Personajes nuevos**: Owl, Frog, Crab y Pou, además de los cuatro originales. Las plantillas aceptan `W` (blanco fijo), que usa Pou en los ojos.
- **Datos aparte del original**: `~/Library/Application Support/perch-terminal`, logs en `~/Library/Logs/perch-terminal` y defaults en `local.perch-terminal`. Los puertos siguen siendo 7777 y 7778, y los LaunchAgents usan las mismas etiquetas, así que no puede convivir con una instalación del Tomari original.

### Instalar y arrancar

`tomari setup [--host app|ghostty]` instala los binarios, los hooks del host y los LaunchAgents, como en el original; `tomari uninstall` los quita. Necesita un build de release, con `tomari`, `tomari-overlay` y `Tomari_TomariCore.bundle` en la misma carpeta.

Para desarrollo hay un atajo que no instala nada ni arranca al iniciar sesión:

```bash
bin/tomari-up                          # compila lo que cambió y levanta el agente y la franja en segundo plano
bin/tomari-down                        # los detiene
.build/tomari/tomari status    # host en uso, ¿responde el agente?, ¿están los hooks?
.build/tomari/tomari host app  # cambia de host con el agente corriendo
```

Necesita Bun y las Command Line Tools de Xcode. El resto de este README describe el Tomari original; `npx @elrincondeldev/tomari`, `npm/`, `scripts/release.ts` y el workflow de release no se usan en este fork.

## Install

```bash
npx tomari setup
```

That's all: the strip appears on the right edge with a **+** to pin your sessions, and it comes back at every login. Setup:

- copies Tomari's binaries into `~/Library/Application Support/tomari/bin`;
- adds hooks to `~/.claude/settings.json`, after backing it up, so Claude Code reports each event to Tomari's agent;
- starts the agent and the strip now and at every login, as LaunchAgents;
- replaces [claude-panel](https://github.com/elrincondeldev/claude-panel)'s agent if you have it, keeping its pinned sessions, their looks and its pairing token;
- moves an install from when Tomari was called Perch (`@elrincondeldev/perch`) into Tomari's places, keeping its pins, icons and token.

```bash
npx tomari status             # what's installed and running
npx tomari uninstall          # remove everything; asks before deleting pins and icons
npx tomari setup --pi         # also let a claude-panel Raspberry Pi connect over your network
```

You need the Claude desktop app (sessions in its Code tab), the Claude Code CLI 2.1.285 or newer, and Node.js 18 or newer for `npx`.

## Features

- **The sessions you choose**: the **+** at the end of the strip lists every session in the Claude desktop app, recent or old, running or stopped; pick one to pin it. Sessions you haven't pinned show up only while they work or wait for you, and for five minutes after they finish, so a fresh install starts with just the +.
- **One creature per session**, animated by its state: working, needs permission, asking you, compacting, done, error or closed. Finished sessions fall asleep after five minutes.
- **Hard to miss when it needs you**: a permission request blinks the creature's tile in orange; a question rings it in orange. A working creature hops with typing dots over its head, and one that finished its turn holds up a green check, ringed in green, until you reply or it falls asleep.
- **Hover** for the session's name and status, e.g. `Bash: npm test` or `done · 5m`.
- **Click** to open the session in the Claude desktop app, even one the app has stopped. The session in front is ringed in white.
- **Right-click** (or control-click) to pin or unpin the session and pick its character and color.
- **Stays out of the way**: the strip floats over every Space and full-screen app and never takes focus from the app you're using. The arrow tab beside it slides the strip off the edge, leaving just the tab, which blinks orange when a session needs you; click it again to bring the strip back.
- **Menu bar item** to show or hide the strip, move it to the left or right edge, and see how many sessions are waiting for you. Quit Tomari there; it starts again at your next login.

## How it works

```
Claude Code ─ hooks ─▶ tomari agent ◀─ WebSocket (127.0.0.1:7778, token) ─ tomari-overlay ─ menu bar
claude agents ─ poll ─▶  └ SQLite: pins, icons                       └ claude-panel Pi (with --pi)
```

- **`tomari`** (`agent/`, Bun and TypeScript compiled into one binary) holds the CLI and the agent. The agent tracks every session's state from Claude Code hooks and `claude agents --json`, keeps pins and icons in SQLite, and opens sessions in the desktop app. It listens on 127.0.0.1 only, unless you set it up with `--pi`.
- **`tomari-overlay`** (`Sources/`, Swift) is a native AppKit and Core Animation app that runs as an accessory: no Dock icon, just the strip and a menu bar item. It costs about 0.5 % of one CPU core and 13 MB of memory while it animates.
- **`shared/protocol.ts`** is the contract between them, and the Pi panel speaks it too.

| What the agent reads from Claude | Used for | Documented? |
|---|---|---|
| Hooks in `~/.claude/settings.json` | Instant state changes | Yes |
| `claude agents --json` | Names, who is alive, corrections for missed hooks | Yes |
| `claude --desktop --resume <id>` | Opening a session the desktop app doesn't know | Yes |
| `claude://code/continue?session=local_…` | Opening any desktop-app session, running or stopped | No |
| `~/Library/Application Support/Claude/claude-code-sessions/` | The app's sessions, and their `local_…` ids | No |
| `setFocusedSession` in `~/Library/Logs/Claude/main.log` | Which session is in front | No |

If a Claude update breaks an undocumented source, only the feature it feeds stops working.

## Customizing the creatures

The characters are 16×16 text templates in [`Sources/TomariCore/Resources/characters.json`](Sources/TomariCore/Resources/characters.json):

| Field | Meaning |
|---|---|
| `body` | 16 rows of 16 cells: `B` body (the session's color), `D` darker, `L` lighter, `F` face plate, `P` pink, `W` white, `.` empty |
| `walk` | Optional rows that replace the body from `row` down on alternate frames while the session works |
| `eyes` | Top-left corners of the two 2×2 eyes, which blink, close and squint on their own |
| `eyeColor` | Optional `#rrggbb` |

After editing, check the templates with `swift run TomariCoreTests` and rebuild.

## Development

You need the Command Line Tools for Xcode (`xcode-select --install`) and [Bun](https://bun.sh) 1.3 or newer.

```bash
(cd agent && bun install)
bun test agent npm             # agent, CLI and npm launcher
swift run TomariCoreTests       # protocol, session list, status rules, sprites and layout
swift build                    # debug overlay: .build/debug/tomari-overlay
bun scripts/release.ts --arch arm64      # npm packages in dist/npm
dist/npm/tomari-darwin-arm64/bin/tomari setup   # install that build
```

The Command Line Tools for Xcode 15 ship without XCTest, so the Swift tests are a plain executable that exits non-zero when a check fails.

Pushing a `v*` tag runs `.github/workflows/release.yml`: it tests, builds for Apple Silicon and Intel, publishes the three npm packages through npm's Trusted Publishing, with no token, and attaches the binaries to a GitHub release. Pull requests that touch what ships run the same build without publishing.

The landing page is an Astro site in `site/`. It draws the creatures from the same `characters.json`, through a TypeScript port of the overlay's sprite renderer in `site/src/domain`.

```bash
cd site && bun install
bun run dev                    # http://localhost:4321
bun test                       # the sprite port and the page's other pure logic
bun run build                  # type-checks, then builds into site/dist
```

On Vercel, import the repository and set its Root Directory to `site`; Vercel detects Astro and builds it with Bun.

## Privacy

- Everything stays on your Mac: the overlay only talks to the agent on 127.0.0.1, and the agent only listens there unless you choose `--pi`. No telemetry.
- The WebSocket needs the pairing token in `~/Library/Application Support/tomari/config.json`, and accepts only `open`, `pin`, `icon` and `library`, with validated arguments.
- Tomari keeps its data in `~/Library/Application Support/tomari/`, its logs in `~/Library/Logs/tomari/`, and the strip's edge in the `com.elrincondeldev.tomari` defaults.
- The hover label can show tool details such as a shell command, so anyone who can see your screen can read them.

## Roadmap

- Homebrew: `brew install elrincondeldev/tap/tomari`, from the same release binaries.
- Drag the strip to any edge, global shortcuts to open sessions, and notifications when a session needs you.

## License

[MIT](LICENSE)
