Misio
Minimalistic version of Visio

Misio is a small flowchart editor that runs in the browser. It is meant for the
everyday drawing work of Visio: shapes, connectors, labels, and a tidy page.
It does not open .vsdx files, and it does not need Visio installed.

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

To open the page from another computer, serve this folder on the network.
A Raspberry Pi can do that:

    python3 -m http.server 8765 --bind 0.0.0.0

Then open http://<this-computer>:8765/. Drawings still download as JSON in
the browser that made them.


Draw
----

Drag a shape from the list onto the page. Positions snap to a 20-pixel grid.

    Select (V)          move a shape, or resize it from a corner
    Connector (C)       drag from a port (top, right, bottom, left) to a port.
                        The menu beside it sets no arrow, one arrow, or
                        two arrows. Automatic keeps one arrow on a
                        flowchart and none on an AREI wire. With a
                        connector selected, the menu changes that connector.
    Bus (B)             drag a horizontal bar. Drop a symbol on the bar
                        to add a tap and a wire.
    Shift-click         add or remove a shape from the selection
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
                        (Ctrl+Shift+L)
    Legend              add a key of every symbol used on the page,
                        in the bottom right corner. Click it again
                        to refresh the key.
    Language            English, Nederlands, or Français. Buttons,
                        messages, shape names, and the legend follow
                        the choice. Text you type on a shape stays as
                        you wrote it. English is the default.
    Undo / Redo         Ctrl+Z, and Ctrl+Y or Ctrl+Shift+Z
    New / Open / Save   a Misio JSON file. Save is also Ctrl+S.
    Export SVG          download the drawing as misio.svg
    Export PDF          open one sheet, with the title and the drawing,
                        and print it. Choose Save as PDF.

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
plug, and connector. Pneumatics holds a shop-air set, from compressor
and valves to cylinder and silencer. Plumbing holds the water side:
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
    misio.py            the launcher
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
    shapes: id, type, x, y, w, h, text
    connectors: id, fromId, fromPort, toId, toPort, text, ends
