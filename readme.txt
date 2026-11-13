Misio
A small flowchart editor

Misio is a small flowchart editor that runs in the browser. It draws
shapes, connectors, and labels on a tidy page.
It imports and exports Visio .vsdx drawings, and it does not need Visio installed.
A drawing exported here comes back intact. A drawing made in Visio comes in
as its shapes, text, and connectors. A Visio stencil Misio does not know
becomes a plain box.

The picture of the editor is screenshot.png. GitHub shows it in README.md.
A reload brings back the drawing that was open.


Run
---

From this folder:

    py -3 misio.py

The window starts a local server, opens the page, and shows whether the server
is running. If port 8765 is taken, it tries the next port up to 8784. The
launcher only listens on this computer.

Each launch writes two logs in the logs folder:

    logs\misio.log                         the latest session
    logs\misio-YYYYMMDD-HHMMSS.log         a copy of that session

Use Open log folder in the launcher when you need them. The log records the
Python version, the folder being served, the URL, each request, and errors.

Requirements: Python 3 with tkinter, which is included in the standard Windows
install. The editor itself is a static page (index.html, styles.css, app.js)
and needs no extra packages.

On a Raspberry Pi
-------------------

The page other people open is served by serve.py. misio.py is only the
window on a Windows PC.

deploy/SETUP.md is the Pi setup. The service listens on the Pi, and
Cloudflare publishes it. From this folder you can also run:

    python3 serve.py --host 0.0.0.0 --port 8765

Then open http://<the-pi>:8765/.

The first visit shows a short notice. Accept stores one cookie and counts
return visits, the browser, and the country Cloudflare reports. Refuse still
opens the editor. That visit counts as a page open, not as a returning
visitor. The drawing, the language, and snap stay in the browser either way.

Report, in the top bar, sends a bug or a request. The words are stored as
written. Admin, at the bottom of the shape list, opens /admin.html.
The first sign-in is user admin and password 100. Change that password
after signing in. The page then shows:

    visitors over the past day, week, and month
    browsers, and countries, counted once for each visitor who accepted
    errors from the page and from the server
    the reports, with Remove on each one

reports.json, usage.json, errors.json, and admin.json stay next to
serve.py. They are not in git. They remain after a reboot. Run the service
as the same user each time so it can keep writing them. If the service is
stopped, a report says it could not be saved. If the folder cannot be
written, the admin page names the file and the reason, and the same line is
in journalctl -u misio.

python3 -m http.server only hands out the page. It does not store reports.

Drawings still download as JSON in the browser that made them.


Draw
----

Drag a shape from the list onto the page. Positions snap to a 20-pixel grid.

    Select (V)          move a shape, or resize it from a corner
    Snap                on by default. Shapes and lines sit on the
                        grid. Turn it off to drag continuously.
    Rotate (R)          turn the selected shapes a quarter turn.
                        Shift-click, or Shift+R, turns the other way.
    Connector (C)       drag from a port to a port. A valve has one
                        port on each air entry.
                        The menu beside it sets no arrow, one arrow, or
                        two arrows. Automatic keeps one arrow on a
                        flowchart and none on an AREI wire. With a
                        connector selected, the menu changes that connector.
                        Color changes that line. With no color chosen,
                        the line stays black.
    Bus (B)             drag a horizontal bar. Drop a symbol on the bar
                        to add a tap and a wire.
    Ctrl or Shift-click add or remove a shape. Hold Ctrl and drag a
                        box to select everything inside it. Drag one
                        selected shape and the others move with it.
    Align left          line up the left edges of the selected shapes
    Space               space the selected shapes evenly
    Ctrl+C, Ctrl+V      copy and paste the selection. Ctrl+D duplicates it.
    Search              the box above the shape list. Try rcd or stopcontact.
    Double-click        edit the text on a shape or on a connector
    Delete              remove the selection
    Arrow keys          nudge the selected shape by one grid step
    Space + drag        pan the page. The middle mouse button pans too.
    Wheel, + and -      zoom
    Fit                 fit the whole diagram in the window
    Arrange             lay the flowchart out from top to bottom
                        (Ctrl+Shift+L). Swimlanes stay where they are.
    Swimlane            add a process lane (L). Click again for the next
                        row. Shift-click, or Shift+L, adds a column.
                        Double-click the name to rename it. Select a lane
                        and use Color to give that lane its own color.
                        Steps inside the lane move with it.
    Legend              add a key of every symbol used on the page,
                        in the bottom right corner. Click it again
                        to refresh the key.
    Language            English, Nederlands, or Français. Buttons,
                        messages, shape names, and the legend follow
                        the choice. Text you type on a shape stays as
                        you wrote it. English is the default.
    Undo / Redo         Ctrl+Z, and Ctrl+Y or Ctrl+Shift+Z
    New / Open / Save   a Misio JSON file. Save is also Ctrl+S.
    Import Visio        open a .vsdx file. A drawing exported here comes
                        back intact. A drawing made in Visio comes in as
                        its shapes, text, and connectors.
    Export Visio        download a .vsdx file Visio can open. Flowchart
                        shapes stay shapes. Other symbols are pictures,
                        and the Misio drawing is kept inside the file.
    Export SVG          download the drawing as misio.svg
    Export PDF          open one sheet, with the title and the drawing,
                        and print it. Choose Save as PDF.
    Report              send a bug or a request. It is stored by serve.py.

Connectors stay orthogonal and stay glued to their ports when a shape moves.
On a decision, Yes leaves the bottom and No leaves the right. Arrange keeps
those two exits, and points the other connectors at the side that faces the
next shape. Shapes that are not connected are packed in a row under the flow.

Shapes: Start / end, Process, Decision, Subprocess, Document, Data, Database,
Preparation, Manual input, Delay, Off-page, On-page, and Text. These stay
visible in the shape list.

Belgian single-line diagrams (eendraadschema, AREI Boek 1 tabel 2.23) are in
one folded AREI group. Open it, then open a section: Supply, Boards, Cables,
Protection, Switches, Sockets, Loads, Sources, or Home automation.
The text under a symbol is the rating or the cable type; double-click to
change it.

Network diagrams use the folded Network group: servers, racks, switches,
routers, firewalls, access points, clouds, and the other common nodes. The
text under a symbol is its name; double-click to rename a device.

Vehicle holds a car or motorcycle wiring set: battery, ground, fuse,
relay, switch, lamp, horn, motor, alternator, coil, ECU, sensor, spark
plug, and connector. Pneumatics holds a shop-air set: preparation,
2/2 to 5/3 valves including bistable, single- and double-acting
cylinders, flow control, logic valves, vacuum, sensors, and a vibrator.
Plumbing holds the water side:
pump, valves, tank, boiler, radiator, tap, meter, and heat exchanger.
A wire between two of these symbols is a plain line. Double-click a
symbol to add a rating.


Example
-------

eendraadschema.json is a Belgian single-line diagram. Use Open, then Fit.
Leave Arrange alone on that file: Arrange lays a page out as a flowchart.


Files
-----

    index.html          the page
    styles.css          the layout
    app.js              the editor
    lang.js             English, Dutch, and French shape names
    arei.js             Belgian AREI single-line symbols
    network.js          network diagram symbols
    schematic.js        vehicle, pneumatic, and plumbing symbols
    visio.js            open and save Visio .vsdx files
    misio.py            the Windows launcher, for trying the page on a PC
    serve.py            the server. Stores reports, visits, and errors
    admin.html          the admin page
    deploy/SETUP.md     how to run it on the Raspberry Pi
    favicon.svg         the browser icon
    favicon.ico         the same icon for older browsers
    eendraadschema.json the example single-line diagram
    screenshot.png      the picture in README.md
    README.md           the guide GitHub shows
    readme.txt          this file

A saved diagram is JSON:

    app: "Misio"
    title: "Misio"
    version: 1
    shapes: id, type, x, y, w, h, text. rotation may be
            90, 180, or 270. A swimlane may also
            set axis to "row" or "column", and color to "#rrggbb".
    connectors: id, fromId, fromPort, toId, toPort, text, ends.
                A connector may also set color to "#rrggbb".
