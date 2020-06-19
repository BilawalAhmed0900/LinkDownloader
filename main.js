"use strict";
const electron = require("electron");
const {app, BrowserWindow, Menu} = electron;
const ARGS = require("minimist")(process.argv.slice(2))

const WINDOW_WIDTH = 800;
const WINDOW_HEIGHT = 300;
const LINK_ARGUMENT_STRING = "link"
const LINK_ARGUMENT = `--${LINK_ARGUMENT_STRING}=`;
let mainWindow;

const Url = ARGS[LINK_ARGUMENT_STRING];
if (Url === undefined)
{
  console.log(`(npm start --|electron .|package executable) ${LINK_ARGUMENT}Url`);
  process.exit();
}

app.on("ready", () =>
{

});