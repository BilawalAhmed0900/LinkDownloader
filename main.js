"use strict";
const electron = require("electron");
const {app, BrowserWindow, Menu, dialog, ipcMain} = electron;
const ARGS = require("minimist")(process.argv.slice(2));
const path = require("path");
const http = require("http");
const https = require("https");
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

/*
  Takes in
    UrlString as String
    CookiesJSON as JSON

  Returns
    Promise that may resolve to JSON containing response of HEAD request
*/
function getHead(UrlString, CookiesJSON)
{
  const module = UrlString.startsWith("https") ? https : http;
  return new Promise((resolve, reject) =>
  {
    const req = module.request(UrlString, {method: "HEAD", headers: {"Cookie": CookiesJSON}}, 
      res =>
      {
        resolve(res.headers);
      });

    req.on("error", error =>
    {
      reject(error);
    });

    req.end();
  });
}

/*
  Takes in
    UrlString as string
    HEADRequestJSON as JSON, returned from getHead

  returns
    String that contains filename to use for downloading
*/
function getFileName(UrlString, HEADRequestJSON)
{
  if ("Content-Disposition" in HEADRequestJSON)
  {
    const fileNameRegex = /filename=\"(.*?)\"/
    const result = fileNameRegex.exec(HEADRequestJSON["Content-Disposition"]);
    if (result !== null)
    {
      return result[1];
    }
  }

  return UrlString.substr(UrlString.lastIndexOf("/") + 1);
}

/*
  Takes in
    HEADRequestJSON as JSON, returned from getHead

  returns
    bool if the url supports resuming from which HEAD has taken
*/
function isResumable(HEADRequestJSON)
{
  if ("accept-ranges" in HEADRequestJSON)
  {
    if (HEADRequestJSON["accept-ranges"].indexOf("bytes") !== -1)
    {
      return true;
    }
  }

  return false;
}

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
      const dataJSON = JSON.parse(data);
      dataJSON["cookies"] = JSON.parse(dataJSON["cookies"]);

      let headRequest;
      try
      {
        headRequest = await getHead(dataJSON["finalUrl"], dataJSON["cookies"]);
        dataJSON["filename"] = getFileName(dataJSON["finalUrl"], headRequest);
      }
      catch(error)
      {
        dialog.showMessageBoxSync(null, 
          {
            type: "error",
            title: "Error",
            message: String(error)
          });
        return;
      }

      // console.log(dataJSON);
      // console.log(headRequest);

      const saveFileName = dialog.showSaveDialogSync(null, 
        {
          defaultPath: path.join(app.getPath("downloads"), dataJSON["filename"]),
          properties: ["createDirectory", "dontAddToRecent"]
        });

      if (saveFileName === undefined)
      {
        return;
      }
      
      const mainWindow = new BrowserWindow(
        {
          width: WINDOW_WIDTH,
          height: WINDOW_HEIGHT,
          resizable: false,
          show: false,
          webPreferences: 
          {
            nodeIntegration: true
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
      });

      Menu.setApplicationMenu(null);
      /*
        After the service gets ready, send necessary data for the electron window for
        downloading process
      */
      mainWindow.webContents.on("did-finish-load", () =>
      {
        ipcMain.on("close-mainwindow", (_event, message) =>
        {
          if (message === true)
          {
            mainWindow.close();
          }
        });
        
        mainWindow.webContents.send("downloading-data", JSON.stringify(
        {
          filename: dataJSON["filename"],
          url: dataJSON["finalUrl"],
          length: 
            headRequest["content-length"] !== undefined 
            ? parseInt(headRequest["content-length"], 10)
            : -1,
          cookies: JSON.stringify(dataJSON["cookies"]),
          is_resumable: isResumable(headRequest)
        }));
      });
    });
  });
});
