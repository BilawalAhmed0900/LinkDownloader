"use strict";
const electron = require("electron");
const {app, BrowserWindow, Menu, dialog} = electron;
const ARGS = require("minimist")(process.argv.slice(2));
const path = require("path");
const http = require("http");
const https = require("https");
const url = require('url');

const WINDOW_WIDTH = 800;
const WINDOW_HEIGHT = 300;
const WINDOW_HTML_FILE = 'mainWindow.html';

const LINK_ARGUMENT_STRING = "link"
const LINK_ARGUMENT = `--${LINK_ARGUMENT_STRING}=`;
const COOKIE_ARGUMENT_STRING = "cookie"
const COOKIE_ARGUMENT = `--${COOKIE_ARGUMENT_STRING}=`;
let mainWindow;

/*
  Takes in
    UrlString as String
    cookies as JSON

  Returns
    Promise that may resolve to JSON containing reponse of HEAD request
*/
function getHead(UrlString, cookies)
{
  const module = UrlString.startsWith("https") ? https : http;
  return new Promise((resolve, reject) =>
  {
    const req = module.request(UrlString, {method: "HEAD", headers: {"Cookie": cookies}}, 
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
    if (result != null)
    {
      return result[1];
    }
  }

  return UrlString.substr(UrlString.lastIndexOf("/") + 1);
}

const Cookies = JSON.parse(ARGS[COOKIE_ARGUMENT_STRING] | "{}");
const UrlString = ARGS[LINK_ARGUMENT_STRING];
if (UrlString === undefined)
{
  console.log(`(npm start --|electron .|package executable) ${LINK_ARGUMENT}Url [${COOKIE_ARGUMENT}Cookie]`);
  process.exit();
}

app.on("ready", async() =>
{
  let responseHeader;
  let fileName;
  try 
  {
    responseHeader = await getHead(UrlString, Cookies);
    fileName = getFileName(UrlString, responseHeader);
  } 
  catch (error) 
  {
    console.log(error);
    app.quit();
  }
  
  const showSaveDialogResult = await dialog.showSaveDialog(null, 
    {
      defaultPath: path.join(app.getPath("downloads"), fileName),
      properties: ["createDirectory", "dontAddToRecent"]
    });
  
  if (showSaveDialogResult["canceled"] === true)
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

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, WINDOW_HTML_FILE),
    slashes: true,
    protocol: "file:"
  }));

  mainWindow.on("close", () =>
  {
    app.quit();
  });

  mainWindow.on("ready-to-show", () =>
  {
    mainWindow.show();
  });

  Menu.setApplicationMenu(null);
});