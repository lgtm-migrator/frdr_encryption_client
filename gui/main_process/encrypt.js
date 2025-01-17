const {BrowserWindow, dialog, ipcMain, shell, app} = require('electron');
const path = require('path');
const fs = require('fs');
const {sendMessage} = require('../main.js');

var basepath = app.getPath("userData");

// Main process to open a folder selector dialog
ipcMain.on('encrypt-open-input-dir-dialog', function (event) {
  var selected_path = dialog.showOpenDialogSync({properties: ['openDirectory']});
  if (selected_path) {
    event.reply('encrypt-selected-input-dir', selected_path);
  }
})

ipcMain.on('encrypt-open-output-dir-dialog', function (event) {
  var selected_path = dialog.showOpenDialogSync({properties: ['openDirectory']});
  if (selected_path) {
    event.reply('encrypt-selected-output-dir', selected_path);
  }
})

ipcMain.on('encrypt', async (event, input_path, output_path, options) => {
  var response = dialog.showMessageBoxSync(options);
  if (response == 0) {
    var childWindow = new BrowserWindow({ 
      parent: BrowserWindow.getFocusedWindow(), 
      modal: true, 
      show: false, 
      width: 400, 
      height: 200, 
      webPreferences: {
        nodeIntegration: true
      }
    });
    childWindow.loadURL(require('url').format({
      pathname: path.join(__dirname, '../pages/encrypt-in-progress.html'),
      protocol: 'file:',
      slashes: true
    }));
    childWindow.once('ready-to-show', () => {
      childWindow.show()
    });

    const { result } = await sendMessage("encrypt", [input_path, output_path]);
    var success = result[0];
    var message = result[1];
    if (message != "") {
      childWindow.close();
    }
    if (success){
      event.reply('notify-encrypt-done', message);
      shell.showItemInFolder(message);
    } else {
      event.reply('notify-encrypt-error', message);
    }
  }
});

ipcMain.on('encrypt-cancel', (event) => {
  try {
    const pid = fs.readFileSync(path.join(basepath, 'pid'), 'utf8');
    process.kill(pid);
  } catch (err) {
    event.reply('notify-encrypt-cancel-error', err);
  }
});

ipcMain.on('encrypt-done-show-next-step', (_event) => {
  var currentWindow = BrowserWindow.getFocusedWindow();
  currentWindow.loadURL(require('url').format({
    pathname: path.join(__dirname, '../pages/encrypt-done.html'),
    protocol: 'file:',
    slashes: true
  }));

  currentWindow.once('ready-to-show', () => {
    currentWindow.show()
  });
});