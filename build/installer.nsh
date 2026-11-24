; 自定义卸载：清理 app.setLoginItemSettings 写入的开机自启 Run 键。
; NSIS 默认只删除快捷方式与安装目录，不会处理 Electron 写的 Run 键。
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "vivian-desktop-pet"
!macroend
