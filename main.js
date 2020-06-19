"use strict";
const electron = require("electron");
const {app, BrowserWindow, Menu, dialog, ipcMain} = electron;
const ARGS = require("minimist")(process.argv.slice(2));
const path = require("path");
const http = require("http");
const https = require("https");
const url = require("url");

/*
  Constants
*/
const WINDOW_WIDTH = 650;
const WINDOW_HEIGHT = 205;
const WINDOW_HTML_FILE = 'mainWindow.html';

const LINK_ARGUMENT_STRING = "link"
const LINK_ARGUMENT = `--${LINK_ARGUMENT_STRING}=`;
const COOKIE_ARGUMENT_STRING = "cookies"
const COOKIE_ARGUMENT = `--${COOKIE_ARGUMENT_STRING}=`;
let mainWindow;

/*
  Takes in
    UrlString as String
    CookiesJSON as JSON

  Returns
    Promise that may resolve to JSON containing reponse of HEAD request
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

/*
  Constants
*/
const CookiesJSON = 
  (ARGS[COOKIE_ARGUMENT_STRING] !== undefined) 
  ? JSON.parse(ARGS[COOKIE_ARGUMENT_STRING]) 
  : {};
const UrlString = ARGS[LINK_ARGUMENT_STRING];
if (UrlString === undefined)
{
  console.log(`(npm start --|electron .|package executable) ${LINK_ARGUMENT}Url [${COOKIE_ARGUMENT}CookieAsJSON]`);
  process.exit();
}

app.on("ready", async() =>
{
  let responseHeader;
  let fileName;
  try 
  {
    responseHeader = await getHead(UrlString, CookiesJSON);
    fileName = getFileName(UrlString, responseHeader);
  } 
  catch (error) 
  {
    dialog.showMessageBoxSync(null, 
    {
      type: "error",
      title: "Error",
      message: String(error)
    });
    app.quit();
  }
  
  const saveFileName = dialog.showSaveDialogSync(null, 
    {
      defaultPath: path.join(app.getPath("downloads"), fileName),
      properties: ["createDirectory", "dontAddToRecent"]
    });
  
  if (saveFileName === undefined)
  {
    app.quit();
  }

  mainWindow = new BrowserWindow(
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

  mainWindow.on("close", () =>
  {
    app.quit();
  });

  mainWindow.on("ready-to-show", () =>
  {
    mainWindow.show();
  });

  // mainWindow.toggleDevTools();
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
      filename: fileName,
      url: UrlString,
      length: 
        responseHeader["content-length"] !== undefined 
        ? parseInt(responseHeader["content-length"], 10)
        : -1,
      cookies: JSON.stringify(CookiesJSON),
      is_resumable: isResumable(responseHeader)
    }));
  });
});
