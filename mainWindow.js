"use strict";
const electron = require("electron");
const {ipcRenderer, remote} = electron;
const path = require("path");
const http = require("http");
const https = require("https");
const fs = require("fs");
const crypto = require("crypto");

/*
  These are all information about the file to download from the Url send from ipcMain
  These are global variables so, whole page knows about them
*/
let filenameString = null;
let UrlString;
let CookieString;
let UserAgentString;
let length;
let lengthString;
let mainHttpRequest = null;

/*
  This will let us know, if we have paused the downloading or it has completed, after
  the client is destroyed
*/
let isPaused = false;

function download()
{
  downloadFromURL(UrlString, CookieString, UserAgentString).then(async([tempFilePath, actualFilePath]) =>
  {
    if (isPaused === false)
    {
      const {size} = fs.statSync(tempFilePath);

      document.title = `Copying to ${actualFilePath}...`;
      document.getElementById("progressBar").value = 0;
      const readStream = fs.createReadStream(tempFilePath);

      let copied = 0;
      readStream.on("data", chunk =>
      {
        copied += chunk.length;
        document.getElementById("progressBar").value = (copied / size) * document.getElementById("progressBar").max;
      });

      const stream = readStream.pipe(fs.createWriteStream(actualFilePath));

      /*
        Wait for piping to finish
      */
      await new Promise(fullfill => stream.on("finish", fullfill));
      stream.close();
      readStream.close();
      fs.unlinkSync(tempFilePath);
      remote.getCurrentWindow().close();
    }
  }).catch((error) =>
  {
    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), 
    {
      type: "error",
      title: "Error",
      message: String(error)
    });
    remote.getCurrentWindow().close();
  });
}

/*
  If we click the cancel button, terminate the connection and closes the window
*/
document.getElementById("cancelButton").addEventListener("click", event =>
{
  event.preventDefault();

  if (remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), 
  {
    type: "question",
    buttons: ["Yes", "No"],
    title: "Question",
    message: "Are you sure you want to cancel?"
  }) === 0)
  {
    if (mainHttpRequest !== null)
    {
      isPaused = true;
      mainHttpRequest.destroy();
      remote.getCurrentWindow().close();
    }
  }
});

document.getElementById("pauseButton").addEventListener("click", event =>
{
  event.preventDefault();

  if (document.getElementById("pauseButton").innerHTML === "Pause")
  {
    document.getElementById("pauseButton").disabled = true;
    isPaused = true;
    mainHttpRequest.destroy();
    document.getElementById("pauseButton").innerHTML = "Resume";
    document.getElementById("pauseButton").disabled = false;
  }
  else if (document.getElementById("pauseButton").innerHTML === "Resume")
  {
    document.getElementById("pauseButton").disabled = true;
    isPaused = false;
    document.getElementById("pauseButton").innerHTML = "Pause";
    download();
    document.getElementById("pauseButton").disabled = false;
  }
});

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

function downloadFromURL(UrlString, CookieString, UserAgentString)
{
  return new Promise((resolve, reject) =>
  {
    /*
      Make a unique temporary file name for each link using sha256
    */
    const hash = crypto.createHash("sha256");
    const tempFileName = path.join(remote.app.getPath("downloads"), hash.update(UrlString).digest("hex"));
    //console.log(tempFileName);
    const startByte = fs.existsSync(tempFileName) ? fs.statSync(tempFileName).size : 0;
    //console.log(startByte);

    const module = (UrlString.startsWith("https")) ? https : http;
    mainHttpRequest = module.get(UrlString, 
      {
        headers: 
          {
            "Cookie": CookieString,
            "User-Agent": UserAgentString,
            "Range": `bytes=${startByte}-`
          }
      }, res =>
    {
      const {statusCode, headers} = res;
      //console.log(statusCode);
      //console.log(headers);
      /*
        Get the file size and update GUI accordingly
      */
      if ("content-length" in headers)
      {
        length = parseInt(headers["content-length"]);
        lengthString = normalizeSize(length);
      }
      else
      {
        length = -1;
        lengthString = "(Unknown)";
      }
      document.getElementById("setSizeTo").innerHTML = lengthString;

      /*
        At first time, it is null, we will extract from content-disposition and ask user,
        next time, we will just use the previous one for occasions like pausing
      */
      if (filenameString === null)
      {
        if ("content-disposition" in headers)
        {
          const filenameRegex = /filename=\"(.*?)\"/;
          const resultant = filenameRegex.exec(headers["content-disposition"]);
          if (resultant !== null)
          {
            filenameString = resultant[1];
          }
          else
          {
            filenameString = UrlString.substr(UrlString.lastIndexOf("/") + 1);
          }
        }
        else
        {
          filenameString = UrlString.substr(UrlString.lastIndexOf("/") + 1);
        }
  
        const toDownloadTo = remote.dialog.showSaveDialogSync(remote.getCurrentWindow(),
        {
          defaultPath: path.join(remote.app.getPath("downloads"), filenameString),
          properties: ["createDirectory", "dontAddToRecent"]
        });
  
        if (toDownloadTo === undefined)
        {
          res.resume();
          isPaused = true;
          mainHttpRequest.destroy();
          remote.getCurrentWindow().close();
        }
        filenameString = toDownloadTo;
      }
      document.title = `Downloading ${filenameString}...`;

      let file = null;
      /*
        If the result is 206, we append to previous created file, else we create new one
      */
      if (statusCode === 206)
      {
        document.getElementById("setResumableTo").innerHTML = "Yes";
        file = fs.createWriteStream(tempFileName, 
          {
            flags: "a"
          });
      } 
      else if (statusCode === 200)
      {
        document.getElementById("setResumableTo").innerHTML = "No";
        file = fs.createWriteStream(tempFileName, 
          {
            flags: "w"
          });
      }
      else
      {
        isPaused = true;
        res.resume();
        mainHttpRequest.destroy();
        reject(`HTTP status code: ${statusCode}`);
      }

      let currentIteration = 0;
      let downloaded = 0;
      let previousDownloaded = 0;
      let startTime = process.hrtime();
      res.on("data", chunk =>
      {
        downloaded += chunk.length;
        ++currentIteration;
        if (currentIteration === 4)
        {
          const elapsedTime = process.hrtime(startTime);
          document.getElementById("setDownloadedTo").innerHTML = normalizeSize(downloaded);
          if (length !== -1)
          {
            document.getElementById("progressBar").value = (downloaded / length) * 
              document.getElementById("progressBar").max;
          }

          document.getElementById("setSpeedTo").innerHTML = 
            `${normalizeSize((downloaded - previousDownloaded) / (elapsedTime[0] + (elapsedTime[1] / 1e9)))}/s`;

          previousDownloaded = downloaded;
          startTime = process.hrtime();
          currentIteration = 0;
        }
        
        file.write(chunk);
      });
      
      res.on("end", () =>
      {
        file.close();
        resolve([tempFileName, filenameString]);
      });
    })
    .on("error", (error) =>
      {
        reject(error);
      });
  });
}

ipcRenderer.on("downloading-data", async(_event, message) =>
{
  const messageJSON = JSON.parse(message);
  //console.log(messageJSON);

  UrlString = messageJSON["url"];
  CookieString = messageJSON["cookies"];
  UserAgentString = messageJSON["userAgent"];

  document.getElementById("setUrlTo").innerHTML = UrlString;
  document.getElementById("setDownloadedTo").innerHTML = normalizeSize(0);
  download();
});

