const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { pathToFileURL } = require('node:url')
const { registerLocalAI } = require('./local-ai.cjs')
const gameURL = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href
registerLocalAI(ipcMain, url => url === gameURL || (process.env.NODE_ENV === 'development' && new URL(url).origin === 'http://localhost:5173'))

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f172a',
    title: 'Forge of One',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
