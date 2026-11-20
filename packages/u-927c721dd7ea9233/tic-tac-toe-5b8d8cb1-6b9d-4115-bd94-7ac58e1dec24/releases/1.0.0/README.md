# tic-tac-toe

Tic Tac Toe

## In use

![A game in progress on the snow surface: two hand-drawn X marks and two O marks pressed into the snow as blue-shaded grooves, with the score bar on top and the surface picker below](docs/images/snow-game-in-progress.jpg)

![Steamy window surface after a drawn game: X and O marks wiped through the fog show a sharp sunset city behind the glass, with water droplets running down from the strokes; the status reads "It's a draw."](docs/images/steamy-window-draw-result.jpg)

![Chalkboard surface showing X winning across the middle row, with a yellow chalk line drawn through the three X marks; the status reads "You win as X!"](docs/images/chalkboard-winning-line.jpg)

![Sand surface in a 2-player demo: an O pressed into the bottom-left square, and a rejected scribble in the top-centre square that is about to fade; the status reads "Couldn't tell what that was — try again."](docs/images/sand-rejected-scribble.jpg)

Published by Raphael Terrier with MARSL.

## Run this release

```sh
docker pull ghcr.io/render-lab/marsl-tic-tac-toe-5b8d8cb1-6b9d-4115-bd94-7ac58e1dec24:1.0.0
```

Follow [the how-to](HOWTO.md) for runtime arguments, ports, configuration, and expected output. Supply your own credentials at runtime.

## Included

- [Project README](src/README.md)
- [Step-by-step how-to](HOWTO.md)
- [Source](src/) and [container build recipe](Dockerfile)
- [License](LICENSE)

## Build it yourself

From this release directory:

```sh
docker build -f Dockerfile -t ghcr.io/render-lab/marsl-tic-tac-toe-5b8d8cb1-6b9d-4115-bd94-7ac58e1dec24:1.0.0 src
```

Documentation is included in the image at /usr/share/doc/marsl/.

## Version and evidence

Version: 1.0.0

Source digest: `549bc0dddad3221cccbf2fd0f4f381b2cb4384cc44bfaae53321f26be3e5e2ed`

The selected source built and started in a MARSL preview. That does not verify this container or every instruction. GitHub builds the container after internal review; inspect the linked build results and the project documentation for additional evidence.
