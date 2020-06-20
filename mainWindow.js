"use strict";
const electron = require("electron");
const {app, ipcRenderer} = electron;
const http = require("http");
const https = require("https");

function normalizeSize(sizeInBytes, numberOfDecimalDigits = 4)
{
  const suffixArray = ["B", "KiB", "MiB", "GiB", "TiB"]
  let suffixArrayIndex = 0
  let result = sizeInBytes;

  while (true)
  {
    sizeInBytes /= 1024
    if (sizeInBytes > 1)
    {
      result = sizeInBytes;
      ++suffixArrayIndex;
    }
    else
    {
      break;
    }
  }

  return `${result.toFixed(numberOfDecimalDigits)} ${suffixArray[suffixArrayIndex]}`;
}

let filenameString;
let UrlString;
let CookiesJSON;
let isResumable;
let length;
let downloaded;
ipcRenderer.on("downloading-data", (_event, message) =>
{
  const messageJSON = JSON.parse(message);
  if (!("filename" in messageJSON) || !("url" in messageJSON) ||
    !("cookies" in messageJSON) || !("is_resumable" in messageJSON) ||
    !("length" in messageJSON))
  {
    ipcRenderer.send("close-mainwindow", true);
	return;
  }
  messageJSON["cookies"] = JSON.parse(messageJSON["cookies"]);

  filenameString = messageJSON["filename"];
  UrlString = messageJSON["url"];

  document.getElementById("setUrlTo").innerHTML = UrlString;

  CookiesJSON = messageJSON["cookies"];
  isResumable = messageJSON["is_resumable"];
  length = messageJSON["length"];

  document.getElementById("setSizeTo").innerHTML = (length === -1) ? "(Unknown)" : normalizeSize(length);
  document.getElementById("setResumableTo").innerHTML = (isResumable) ? "Yes" : "No";

  downloaded = 0;
  document.getElementById("setDownloadedTo").innerHTML = normalizeSize(downloaded);

  document.title = `Downloading ${filenameString}...`;
});

