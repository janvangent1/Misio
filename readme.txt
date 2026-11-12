Misio
Minimalistic version of Visio

Misio is a small flowchart editor that runs in the browser. It is meant for the
everyday drawing work of Visio: shapes, connectors, labels, and a tidy page.
It does not open .vsdx files, and it does not need Visio installed.


Run
---

From this folder:

    py -3 misio.py

The window starts a local server, opens the page, and shows whether the server
is running. If port 8765 is taken, it tries the next port up to 8784.

Each launch writes two logs in the logs folder:

    logs\misio.log                         the latest session
    logs\misio-YYYYMMDD-HHMMSS.log         a copy of that session

Use Open log folder in the launcher when you need them. The log records the
Python version, the folder being served, the URL, each request, and errors.

Requirements: Python 3 with tkinter, which is included in the standard Windows
install. The editor itself is a static page (index.html, styles.css, app.js)
and needs no extra packages.


Draw
----

Drag a shape from the list onto the page. Positions snap to a 20-pixel grid.

    Select (V)          move a shape, or resize it from a corner
    Connector (C)       drag from a port (top, right, bottom, left) to a port
    Double-click        edit the text on a shape or on a connector
    Delete              remove the selection
    Arrow keys          nudge the selected shape by one grid step
    Space + drag        pan the page. The middle mouse button pans too.
    Wheel, + and -      zoom
    Fit                 fit the whole diagram in the window
    Arrange             lay the flowchart out from top to bottom
                        (Ctrl+Shift+L)
    Undo / Redo         Ctrl+Z, and Ctrl+Y or Ctrl+Shift+Z
    New / Open / Save   a Misio JSON file. Save is also Ctrl+S.
    Export SVG          download the drawing as misio.svg

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


Files
-----

    index.html     the page
    styles.css     the layout
    app.js         the editor
    arei.js        Belgian AREI single-line symbols
    network.js     network diagram symbols
    misio.py       the launcher
    readme.txt     this file

A saved diagram is JSON:

    app: "Misio"
    title: "Misio"
    version: 1
    shapes: id, type, x, y, w, h, text
    connectors: id, fromId, fromPort, toId, toPort, text
