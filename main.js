"use strict";
const electron = require("electron");
const {app, BrowserWindow, Menu, dialog, ipcMain} = electron;
const ARGS = require("minimist")(process.argv.slice(2));
const path = require("path");
const http = require("follow-redirects").http;
const https = require("follow-redirects").https;
const url = require("url");
const WebSocket = require("ws");

/*
  Constants
*/
const WINDOW_WIDTH = 650;
const WINDOW_HEIGHT = 225;
const WINDOW_HTML_FILE = 'mainWindow.html';

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 49152;
const DEFAULT_BACKLOG = 16;

app.on("window-all-closed", (e) =>
{
  e.preventDefault();
});

app.on("ready", () =>
{
  const wss = new WebSocket.Server(
    {
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
      backlog: DEFAULT_BACKLOG,
      perMessageDeflate: false
    });

  wss.on("connection", function connection(ws)
  {
    console.log("Connection establised...");
    ws.on("message", async function incoming(data)
    {
      try
      {
        const dataJSON = JSON.parse(data);
        const mainWindow = new BrowserWindow(
          {
            width: WINDOW_WIDTH,
            height: WINDOW_HEIGHT,
            resizable: false,
            show: false,
            webPreferences: 
            {
              nodeIntegration: true,
              enableRemoteModule: true
            }
          });
        
        mainWindow.loadURL(url.format(
        {
          pathname: path.join(__dirname, WINDOW_HTML_FILE),
          protocol: "file:",
          slashes: true
        }));
      
        mainWindow.on("ready-to-show", () =>
        {
          mainWindow.show();
          // mainWindow.toggleDevTools();
        });

        Menu.setApplicationMenu(null);
        /*
          After the service gets ready, send necessary data for the electron window for
          downloading process
        */
        mainWindow.webContents.on("did-finish-load", () =>
        { 
          mainWindow.webContents.send("downloading-data", JSON.stringify(
          {
            url: dataJSON["finalUrl"],
            cookies: dataJSON["cookies"],
            userAgent: dataJSON["userAgent"]
          }));
        });
      }
      catch (_error)
      {
        
      }
    });
  });

  wss.on("close", () =>
  {
    console.log("Connection closed...");
  });
});
