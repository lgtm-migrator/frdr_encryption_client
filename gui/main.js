"use strict";

if(require('electron-squirrel-startup')) return;
const {app, dialog, Menu, BrowserWindow} = require("electron");
//Does not allow a second instance
const isSecondInstance = app.makeSingleInstance((commandLine, workingDirectory) => {
  notifier.notify({"title" : "FRDR-Crypto", "message" : "FRDR-Crypto is already running."});
});
if (isSecondInstance) {
  app.quit();
}

require('update-electron-app')();
const notifier = require("node-notifier");
const zerorpc = require("zerorpc");
global.client = new zerorpc.Client();
const portfinder = require("portfinder");

const path = require('path')
const PY_CRYPTO_GUI_FOLDER = 'crypto_gui'
const PY_FOLDER = '..'
const PY_MODULE = 'crypto_gui'

let pythonChild = null
let mainWindow = null
//TODO: Add about window?
let aboutWindow = null
let input_path = null;

//TODO: this is for?
const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

const guessPackaged = () => {
  const fullPath = path.join(__dirname, PY_CRYPTO_GUI_FOLDER)
  return require('fs').existsSync(fullPath)
}

const getScriptPath = () => {
  if (!guessPackaged()) {
    return path.join(__dirname, PY_FOLDER, PY_MODULE + '.py')
  }
  if (process.platform === 'win32') {
    return path.join(__dirname, PY_CRYPTO_GUI_FOLDER, PY_MODULE + '.exe')
  }
  return path.join(__dirname, PY_CRYPTO_GUI_FOLDER, PY_MODULE)
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 650,
    backgroundColor: "#D6D8DC",
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadURL(require('url').format({
    pathname: path.join(__dirname, 'indexMain.html'),
    protocol: 'file:',
    slashes: true
  }))

  mainWindow.on('close', (event) => {
    if (mainWindow != null){
      mainWindow.hide();
    }
    mainWindow = null
  });
}

app.on('ready', () => {
  createWindow();
})

portfinder.basePort = 4242;
let port = portfinder.getPort(function (err, port) {
  client.connect("tcp://127.0.0.1:" + String(port));
  const createCrypto = () => {
    let script = getScriptPath()
    if (guessPackaged()) {
      pythonChild = require('child_process').spawn(script, [port])
    } else {
      pythonChild = require('child_process').spawn('python3', [script, port])
    }

    if (pythonChild != null) {
      console.log('Python started successfully')

      pythonChild.stdout.on('data', function (data) {
        console.log(data.toString());
      });

      pythonChild.stderr.on('data', function (data) {
        console.log(data.toString());
      });
    }
  }
  app.on('ready', createCrypto);
});

const exitCrypto = () => {
  pythonChild.kill()
  pythonChild = null
}

app.on("before-quit", ev => {
  if (mainWindow != null){
    mainWindow.close();
  }
  top = null;
});

app.on('will-quit', ev => {
  exitCrypto();
  app.quit();
})


if (process.argv.slice(-1)[0] === '--run-tests') {
  sleep(2000).then(() => {
    const total_tests = 1
    let tests_passing = 0
    let failed_tests = []

    if (pythonChild != null) {
      tests_passing++;
    } else {
      failed_tests.push('spawn_python');
    }

    console.log(`of ${total_tests} tests, ${tests_passing} passing`);

    if (tests_passing < total_tests) {
      console.error(`failed tests: ${failed_tests}`);  
    }

    app.quit();
  });
};

let top = {};

// Main process to open a file/folder selector dialog
const ipc = require('electron').ipcMain
ipc.on('open-file-dialog', function (event) {
  input_path = dialog.showOpenDialog({properties: ['openFile']});
  if (input_path) {
    client.invoke("set_input_path", input_path[0], function(error, res, more) {} );
    event.sender.send('selected-file', input_path)
  }
})

ipc.on('open-dir-dialog', function (event) {
  input_path = dialog.showOpenDialog({properties: ['openDirectory']});
  if (input_path) {
    client.invoke("set_input_path", input_path[0], function(error, res, more) {} );
    event.sender.send('selected-dir', input_path)
  }
})