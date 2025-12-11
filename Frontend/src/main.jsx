import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import 'antd/dist/reset.css'
import './style.css'

const root = createRoot(document.getElementById('root'))
root.render(<App />)
