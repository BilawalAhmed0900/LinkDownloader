"use strict";
const electron = require("electron");
const {app, ipcRenderer} = electron;

let filenameString;
let UrlString;
let CookiesJSON;
let isResumable;
let length;
ipcRenderer.on("downloading-data", (_event, message) =>
{
  messageJSON = JSON.parse(message);
  if (!("filename" in messageJSON) || !("url" in messageJSON) ||
    !("cookies" in messageJSON) || !("is_resumable" in messageJSON) ||
    !("length" in messageJSON))
  {
    ipcRenderer.send("close-mainwindow", true);
  }
  messageJSON["cookies"] = JSON.parse(messageJSON["cookies"]);

  filenameString = messageJSON["filename"];
  UrlString = messageJSON["url"];
  CookiesJSON = messageJSON["cookies"];
  isResumable = messageJSON["is_resumable"];
  length = messageJSON["length"];

  document.title = `Downloading ${filenameString}...`;
});

