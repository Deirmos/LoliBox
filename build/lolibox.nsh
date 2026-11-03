; ===========================================================================
;  LoliBox — кастомный NSIS-скрипт установщика
;  Файл: build/lolibox.nsh
;  Подключение: package.json -> build.nsis.include = "build/lolibox.nsh"
;
;  Что делает:
;   * проверяет наличие внешних компонентов yt-dlp и ffmpeg;
;   * если их нет — предлагает скачать (около 130 МБ) и качает с прогрессом;
;   * всё складывается в %LOCALAPPDATA%\LoliBox\bin — тот же каталог,
;     который использует main/deps.js внутри приложения.
;
;  Обмен с build/deps.ps1 — через маленькие ASCII-файлы в $LBoxStatusDir:
;     started     — 1  (скрипт загрузки запустился)
;     <id>.state  — found | missing
;     <id>.pct    — 0..100
;     <id>.result — ok | error
;     finished    — 1  (загрузка компонентов завершена)
;     error       — текст ошибки (если скрипт упал целиком)
;
;  ВАЖНО (проверено экспериментом на NSIS 3.0.4.1):
;   * nsExec::Exec ЖДЁТ завершения процесса! Из-за этого установщик
;     «замирал» на странице компонентов (nsDialogs::Show не вызывался,
;     пока идёт скачивание). Поэтому загрузка запускается через
;     "cmd /c start /b" — cmd возвращает управление сразу, а PowerShell
;     продолжает работать в фоне. Пустой заголовок "" после /b
;     обязателен: иначе cmd примет первый кавычный аргумент за заголовок
;     окна и не запустит программу.
;   * PageEx custom -> страница с dlg_id = 0; NSIS сам страницу не
;     переключает — переключение происходит при возврате из nsDialogs::Show.
;   * leave-функция вызывается ТОЛЬКО при переходе вперёд (Next/Install).
;     При переходе назад (Back) она не вызывается, но nsDialogs::Show
;     возвращается — поэтому таймер убивается сразу после Show.
;   * Abort в leave-функции оставляет пользователя на странице
;     (nsDialogs::Show не возвращается) — это наш основной «стоп».
;   * Клик по ОТКЛЮЧЁННОЙ кнопке NSIS молча игнорирует, поэтому кнопку
;     «Установить» блокировать нельзя — только запрещать уход через Abort.
;   * В тихом режиме (/S) кастомные страницы вообще не показываются,
;     поэтому весь сценарий компонентов для /S делается в customInit.
;
;  ВАЖНО: этот файл подключается electron-builder'ом в ШАПКУ скрипта,
;  то есть ДО !include "MUI2.nsh". Поэтому всё, что зависит от MUI
;  (MUI_PAGE_INIT, MUI_HEADER_TEXT), живёт внутри макроса
;  customPageAfterChangeDir — он разворачивается уже после MUI2.nsh.
; ===========================================================================

!ifndef BUILD_UNINSTALLER

!include "nsDialogs.nsh"

; ---------------------------------------------------------------- переменные
Var LBoxBinDir
Var LBoxStatusDir
Var LBoxScript
Var LBoxPs
Var LBoxPage
Var LBoxLblYtdlp
Var LBoxLblFfmpeg
Var LBoxLblStatus
Var LBoxBar
Var LBoxCheck
Var LBoxReadFile
Var LBoxValue
Var LBoxStateYtdlp
Var LBoxStateFfmpeg
Var LBoxResultYtdlp
Var LBoxResultFfmpeg
Var LBoxPctYtdlp
Var LBoxPctFfmpeg
Var LBoxPct
Var LBoxMissing
Var LBoxStarted
Var LBoxTicks
Var LBoxWait
Var LBoxNoPs

; LBoxStarted:
;   "0" — загрузка ещё не начиналась
;   "1" — загрузка идёт
;   "2" — загрузка завершена (успешно или с ошибкой)

; ------------------------------------------------------------------- строки
LangString LBOX_TITLE 1049 "Дополнительные компоненты"
LangString LBOX_TITLE 1033 "Additional components"
LangString LBOX_SUBTITLE 1049 "LoliBox использует yt-dlp и ffmpeg для поиска и загрузки музыки"
LangString LBOX_SUBTITLE 1033 "LoliBox uses yt-dlp and ffmpeg to search for and download music"

LangString LBOX_YT_FOUND 1049 "yt-dlp: найден в системе"
LangString LBOX_YT_FOUND 1033 "yt-dlp: found on this system"
LangString LBOX_YT_MISSING 1049 "yt-dlp: не найден"
LangString LBOX_YT_MISSING 1033 "yt-dlp: not found"
LangString LBOX_YT_INSTALLED 1049 "yt-dlp: установлен"
LangString LBOX_YT_INSTALLED 1033 "yt-dlp: installed"
LangString LBOX_YT_ERROR 1049 "yt-dlp: не удалось скачать"
LangString LBOX_YT_ERROR 1033 "yt-dlp: download failed"

LangString LBOX_FF_FOUND 1049 "ffmpeg: найден в системе"
LangString LBOX_FF_FOUND 1033 "ffmpeg: found on this system"
LangString LBOX_FF_MISSING 1049 "ffmpeg: не найден"
LangString LBOX_FF_MISSING 1033 "ffmpeg: not found"
LangString LBOX_FF_INSTALLED 1049 "ffmpeg: установлен"
LangString LBOX_FF_INSTALLED 1033 "ffmpeg: installed"
LangString LBOX_FF_ERROR 1049 "ffmpeg: не удалось скачать"
LangString LBOX_FF_ERROR 1033 "ffmpeg: download failed"

LangString LBOX_CHECK 1049 "Скачать отсутствующие компоненты (около 130 МБ)"
LangString LBOX_CHECK 1033 "Download the missing components (about 130 MB)"
LangString LBOX_ALL_OK 1049 "Все компоненты уже установлены — скачивать нечего"
LangString LBOX_ALL_OK 1033 "All components are already installed — nothing to download"

LangString LBOX_DOWNLOADING 1049 "Загружаем компоненты…"
LangString LBOX_DOWNLOADING 1033 "Downloading components…"
LangString LBOX_WAITING 1049 "Дожидаемся окончания загрузки…"
LangString LBOX_WAITING 1033 "Waiting for the download to finish…"
LangString LBOX_DONE 1049 "Готово"
LangString LBOX_DONE 1033 "Done"
LangString LBOX_FAILED 1049 "Часть компонентов не удалось скачать — их можно докачать в настройках LoliBox."
LangString LBOX_FAILED 1033 "Some components failed to download — you can get them later in LoliBox settings."
LangString LBOX_NO_PS 1049 "Не найден PowerShell — компоненты скачать не удастся. Их можно установить позже в настройках LoliBox."
LangString LBOX_NO_PS 1033 "PowerShell was not found — the components cannot be downloaded. You can install them later in LoliBox settings."

LangString LBOX_STILL_BUSY 1049 "Компоненты ещё скачиваются. Подождите окончания загрузки и потом нажмите «Установить»."
LangString LBOX_STILL_BUSY 1033 "The components are still downloading. Please wait until the download finishes, then press Install."
LangString LBOX_JUST_STARTED 1049 "Началась загрузка компонентов. Подождите окончания загрузки и потом нажмите «Установить»."
LangString LBOX_JUST_STARTED 1033 "The components are being downloaded. Please wait until the download finishes, then press Install."

; ================================================================== утилиты

; Читает файл $LBoxReadFile из $LBoxStatusDir в $LBoxValue.
; Если файла нет — $LBoxValue пустая.
Function LBoxReadState
  StrCpy $LBoxValue ""
  ClearErrors
  FileOpen $R0 "$LBoxStatusDir\$LBoxReadFile" r
  ${If} ${Errors}
    StrCpy $LBoxValue ""
  ${Else}
    FileRead $R0 $R1
    FileClose $R0
    StrCpy $LBoxValue "$R1"
  ${EndIf}
FunctionEnd

; Есть ли файл "finished" — т.е. скрипт загрузки отработал.
Function LBoxIsFinished
  StrCpy $LBoxValue "0"
  IfFileExists "$LBoxStatusDir\finished" 0 lbox_not_finished
    StrCpy $LBoxValue "1"
  lbox_not_finished:
FunctionEnd

; Запустился ли скрипт загрузки (файл "started").
Function LBoxIsAlive
  StrCpy $LBoxValue "0"
  IfFileExists "$LBoxStatusDir\started" 0 lbox_not_alive
    StrCpy $LBoxValue "1"
  lbox_not_alive:
FunctionEnd

; Создаёт файл "finished" (загрузка завершена) — на случай, если скрипт
; вообще не удалось запустить.
Function LBoxMarkFinished
  ClearErrors
  FileOpen $R9 "$LBoxStatusDir\finished" w
  ${If} ${Errors}
  ${Else}
    FileWrite $R9 "1"
    FileClose $R9
  ${EndIf}
FunctionEnd

; Перерисовывает элементы страницы. Используем RDW_UPDATENOW, чтобы
; перерисовка происходила сразу, даже если цикл ожидания блокирует
; обработку сообщений (Sleep без message pump).
Function LBoxRedraw
  ${If} $LBoxPage != ""
    System::Call 'user32::RedrawWindow(i $LBoxPage, i 0, i 0, i 0x0105)i.r0'
  ${EndIf}
  ${If} $LBoxBar != ""
    System::Call 'user32::RedrawWindow(i $LBoxBar, i 0, i 0, i 0x0105)i.r0'
  ${EndIf}
  ${If} $LBoxLblYtdlp != ""
    System::Call 'user32::RedrawWindow(i $LBoxLblYtdlp, i 0, i 0, i 0x0105)i.r0'
  ${EndIf}
  ${If} $LBoxLblFfmpeg != ""
    System::Call 'user32::RedrawWindow(i $LBoxLblFfmpeg, i 0, i 0, i 0x0105)i.r0'
  ${EndIf}
  ${If} $LBoxLblStatus != ""
    System::Call 'user32::RedrawWindow(i $LBoxLblStatus, i 0, i 0, i 0x0105)i.r0'
  ${EndIf}
FunctionEnd

; ================================================================== запуск

; Синхронная проверка наличия компонентов (режим status).
Function LBoxRunStatus
  Delete "$LBoxStatusDir\finished"
  Delete "$LBoxStatusDir\error"
  Delete "$LBoxStatusDir\yt-dlp.state"
  Delete "$LBoxStatusDir\ffmpeg.state"

  nsExec::ExecToStack /TIMEOUT=60000 '"$LBoxPs" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$LBoxScript" -Mode status -BinDir "$LBoxBinDir" -StatusDir "$LBoxStatusDir"'
  Pop $R0
  Pop $R1

  StrCpy $LBoxReadFile "yt-dlp.state"
  Call LBoxReadState
  StrCpy $LBoxStateYtdlp "$LBoxValue"

  StrCpy $LBoxReadFile "ffmpeg.state"
  Call LBoxReadState
  StrCpy $LBoxStateFfmpeg "$LBoxValue"

  StrCpy $LBoxMissing "0"
  ${If} $LBoxStateYtdlp != "found"
    StrCpy $LBoxMissing "1"
  ${EndIf}
  ${If} $LBoxStateFfmpeg != "found"
    StrCpy $LBoxMissing "1"
  ${EndIf}
FunctionEnd

; Асинхронный запуск загрузки/установки компонентов (режим install).
;
; ВАЖНО: nsExec::Exec ЖДЁТ завершения процесса — страница компонентов
; при этом «замирала» (nsDialogs::Show не вызывался, пока идёт
; скачивание). Поэтому запускаем через "cmd /c start /b": cmd сразу
; возвращает управление, а PowerShell продолжает работать в фоне.
; Пустой заголовок "" после /b обязателен — иначе cmd примет первый
; кавычный аргумент за заголовок окна и программу не запустит.
Function LBoxRunInstall
  Delete "$LBoxStatusDir\finished"
  Delete "$LBoxStatusDir\started"
  nsExec::ExecToStack 'cmd /c start /b "" "$LBoxPs" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$LBoxScript" -Mode install -BinDir "$LBoxBinDir" -StatusDir "$LBoxStatusDir"'
  Pop $R0
  Pop $R1
  ${If} $R0 == "error"
    ; PowerShell не удалось запустить — не будем ждать его вечно.
    Call LBoxMarkFinished
  ${EndIf}
FunctionEnd

; Ждёт, пока скрипт закончит (максимум ~20 минут).
Function LBoxWaitFinished
  StrCpy $LBoxWait 0
  lbox_wait_loop:
    IfFileExists "$LBoxStatusDir\finished" 0 lbox_wait_tick
      Goto lbox_wait_done
    lbox_wait_tick:
      IntOp $LBoxWait $LBoxWait + 1
      IntCmp $LBoxWait 2400 lbox_wait_done
      Sleep 500
      Goto lbox_wait_loop
    lbox_wait_done:
FunctionEnd

; ================================================================ интерфейс

; Обновляет подписи компонентов по текущему состоянию.
Function LBoxRefreshLabels
  ${If} $LBoxStateYtdlp == "found"
    ${NSD_SetText} $LBoxLblYtdlp "$(LBOX_YT_FOUND)"
  ${ElseIf} $LBoxResultYtdlp == "ok"
    ${NSD_SetText} $LBoxLblYtdlp "$(LBOX_YT_INSTALLED)"
  ${ElseIf} $LBoxResultYtdlp == "error"
    ${NSD_SetText} $LBoxLblYtdlp "$(LBOX_YT_ERROR)"
  ${Else}
    ${NSD_SetText} $LBoxLblYtdlp "$(LBOX_YT_MISSING)"
  ${EndIf}

  ${If} $LBoxStateFfmpeg == "found"
    ${NSD_SetText} $LBoxLblFfmpeg "$(LBOX_FF_FOUND)"
  ${ElseIf} $LBoxResultFfmpeg == "ok"
    ${NSD_SetText} $LBoxLblFfmpeg "$(LBOX_FF_INSTALLED)"
  ${ElseIf} $LBoxResultFfmpeg == "error"
    ${NSD_SetText} $LBoxLblFfmpeg "$(LBOX_FF_ERROR)"
  ${Else}
    ${NSD_SetText} $LBoxLblFfmpeg "$(LBOX_FF_MISSING)"
  ${EndIf}
FunctionEnd

; Пересчитывает общий прогресс и обновляет элементы страницы.
Function LBoxUpdateProgress
  StrCpy $LBoxReadFile "yt-dlp.result"
  Call LBoxReadState
  StrCpy $LBoxResultYtdlp "$LBoxValue"

  StrCpy $LBoxReadFile "ffmpeg.result"
  Call LBoxReadState
  StrCpy $LBoxResultFfmpeg "$LBoxValue"

  ${If} $LBoxStateYtdlp == "found"
    StrCpy $LBoxPctYtdlp 100
  ${Else}
    StrCpy $LBoxReadFile "yt-dlp.pct"
    Call LBoxReadState
    StrCpy $LBoxPctYtdlp "$LBoxValue"
    ${If} $LBoxPctYtdlp == ""
      StrCpy $LBoxPctYtdlp 0
    ${EndIf}
  ${EndIf}

  ${If} $LBoxStateFfmpeg == "found"
    StrCpy $LBoxPctFfmpeg 100
  ${Else}
    StrCpy $LBoxReadFile "ffmpeg.pct"
    Call LBoxReadState
    StrCpy $LBoxPctFfmpeg "$LBoxValue"
    ${If} $LBoxPctFfmpeg == ""
      StrCpy $LBoxPctFfmpeg 0
    ${EndIf}
  ${EndIf}

  IntOp $LBoxPct $LBoxPctYtdlp + $LBoxPctFfmpeg
  IntOp $LBoxPct $LBoxPct / 2
  ${If} $LBoxPct > 100
    StrCpy $LBoxPct 100
  ${EndIf}
  ${If} $LBoxPct < 0
    StrCpy $LBoxPct 0
  ${EndIf}

  ${NSD_ProgressBar_SetPos} $LBoxBar $LBoxPct
  Call LBoxRefreshLabels
  Call LBoxRedraw
FunctionEnd

; Итоговая подпись после завершения загрузки компонентов.
Function LBoxApplyResult
  Call LBoxUpdateProgress
  ${If} $LBoxResultYtdlp == "error"
  ${OrIf} $LBoxResultFfmpeg == "error"
    ${NSD_SetText} $LBoxLblStatus "$(LBOX_FAILED)"
  ${Else}
    ${NSD_SetText} $LBoxLblStatus "$(LBOX_DONE)"
  ${EndIf}
  Call LBoxRedraw
FunctionEnd

; Запускает асинхронную загрузку компонентов (если ещё не запускали).
Function LBoxStartDownload
  ${If} $LBoxStarted == "0"
    ${If} $LBoxNoPs == "0"
      Call LBoxRunInstall
      StrCpy $LBoxStarted "1"
      StrCpy $LBoxTicks 0
      ; Чекбокс больше не трогаем — загрузка уже идёт.
      EnableWindow $LBoxCheck 0
      ${NSD_SetText} $LBoxLblStatus "$(LBOX_DOWNLOADING)"
      Call LBoxRedraw
    ${Else}
      ; Скачивать нечем — считаем, что загрузка завершена (с ошибкой).
      StrCpy $LBoxStarted "2"
    ${EndIf}
  ${EndIf}
FunctionEnd

; Тикер страницы: обновляет прогресс и следит за окончанием загрузки.
Function LBoxTimerFunc
  ${If} $LBoxStarted == "1"
    IntOp $LBoxTicks $LBoxTicks + 1
    Call LBoxIsFinished
    ${If} $LBoxValue == "1"
      StrCpy $LBoxStarted "2"
      Call LBoxApplyResult
    ${ElseIf} $LBoxTicks >= 2400
      ; 2400 тиков по 500 мс = 20 минут — что-то зависло, отпускаем дальше.
      StrCpy $LBoxStarted "2"
      ${NSD_SetText} $LBoxLblStatus "$(LBOX_FAILED)"
      Call LBoxRedraw
    ${ElseIf} $LBoxTicks >= 30
      ; 15 секунд прошло, а скрипт так и не стартовал — считаем, что
      ; запуск не удался (нет PowerShell или нет интернета).
      ; Запас большой: на медленной машине PowerShell может стартовать
      ; несколько секунд (особенно с антивирусом).
      Call LBoxIsAlive
      ${If} $LBoxValue == "0"
        StrCpy $LBoxStarted "2"
        ${NSD_SetText} $LBoxLblStatus "$(LBOX_FAILED)"
        Call LBoxRedraw
      ${Else}
        Call LBoxUpdateProgress
      ${EndIf}
    ${Else}
      Call LBoxUpdateProgress
    ${EndIf}
  ${EndIf}
FunctionEnd

; ============================================================ точки входа

; Вызывается из .onInit: готовит каталоги, распаковывает deps.ps1,
; проверяет компоненты. В тихой установке (/S) сразу докачивает их.
!macro customInit
  SetShellVarContext current
  StrCpy $LBoxBinDir "$LOCALAPPDATA\LoliBox\bin"

  StrCpy $LBoxStatusDir "$TEMP\lolibox-deps"
  CreateDirectory "$LBoxStatusDir"

  SetOutPath "$LBoxStatusDir"
  File /oname=deps.ps1 "${PROJECT_DIR}\build\deps.ps1"
  SetOutPath "$INSTDIR"
  StrCpy $LBoxScript "$LBoxStatusDir\deps.ps1"

  StrCpy $LBoxPs "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$LBoxPs" 0 lbox_ps_fallback
  Goto lbox_ps_ready
lbox_ps_fallback:
  StrCpy $LBoxPs "powershell.exe"
lbox_ps_ready:

  StrCpy $LBoxStarted "0"
  StrCpy $LBoxTicks 0
  StrCpy $LBoxStateYtdlp ""
  StrCpy $LBoxStateFfmpeg ""
  StrCpy $LBoxResultYtdlp ""
  StrCpy $LBoxResultFfmpeg ""

  ; Если PowerShell вообще недоступен — скачать компоненты нечем.
  StrCpy $LBoxNoPs "0"
  IfFileExists "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" 0 lbox_ps_probe
  Goto lbox_ps_checked
lbox_ps_probe:
  nsExec::ExecToStack /TIMEOUT=10000 'powershell.exe -NoProfile -NonInteractive -Command "exit 0"'
  Pop $R0
  Pop $R1
  ${If} $R0 != "0"
    StrCpy $LBoxNoPs "1"
  ${EndIf}
lbox_ps_checked:

  Call LBoxRunStatus

  ${If} ${Silent}
    ${If} $LBoxMissing == "1"
      ${If} $LBoxNoPs == "0"
        Call LBoxRunInstall
        Call LBoxWaitFinished
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; Страница «Дополнительные компоненты» — между выбором папки и установкой.
;
; Важно: PageCallbacks с двумя аргументами — это pre-функция и leave-функция
; (не create!). Именно в pre-функции создаётся диалог nsDialogs.
!macro customPageAfterChangeDir
  !insertmacro MUI_PAGE_INIT

  Function LBoxPageCreate
    !insertmacro MUI_HEADER_TEXT "$(LBOX_TITLE)" "$(LBOX_SUBTITLE)"

    nsDialogs::Create 1018
    Pop $LBoxPage

    ${NSD_CreateLabel} 15u 15u 240u 16u ""
    Pop $LBoxLblYtdlp
    ${NSD_CreateLabel} 15u 35u 240u 16u ""
    Pop $LBoxLblFfmpeg
    ${NSD_CreateCheckBox} 15u 58u 240u 18u "$(LBOX_CHECK)"
    Pop $LBoxCheck
    ${NSD_CreateProgressBar} 15u 85u 240u 12u ""
    Pop $LBoxBar
    ${NSD_CreateLabel} 15u 103u 240u 16u ""
    Pop $LBoxLblStatus

    Call LBoxRefreshLabels

    ${If} $LBoxMissing == "1"
      ${NSD_Check} $LBoxCheck
      ${If} $LBoxNoPs == "1"
        ; Скачивать нечем — сразу показываем проблему.
        EnableWindow $LBoxCheck 0
        ${NSD_SetText} $LBoxLblStatus "$(LBOX_NO_PS)"
      ${ElseIf} $LBoxStarted == "2"
        ; Мы уже возвращались на страницу — загрузка закончена.
        EnableWindow $LBoxCheck 0
        Call LBoxApplyResult
      ${Else}
        EnableWindow $LBoxCheck 0
        ${If} $LBoxStarted == "0"
          ; Первый заход на страницу — сразу начинаем загрузку,
          ; чтобы она шла параллельно с чтением страницы.
          Call LBoxStartDownload
        ${Else}
          ${NSD_SetText} $LBoxLblStatus "$(LBOX_DOWNLOADING)"
        ${EndIf}
        ; Тикер нужен и для текущего, и для следующего захода на страницу.
        ${NSD_KillTimer} LBoxTimerFunc
        ${NSD_CreateTimer} LBoxTimerFunc 500
      ${EndIf}
    ${Else}
      ${NSD_Uncheck} $LBoxCheck
      EnableWindow $LBoxCheck 0
      ${NSD_SetText} $LBoxCheck "$(LBOX_ALL_OK)"
      ${NSD_ProgressBar_SetPos} $LBoxBar 100
      ${NSD_SetText} $LBoxLblStatus "$(LBOX_DONE)"
    ${EndIf}

    Call LBoxRedraw

    nsDialogs::Show

    ; Страницу покинули (вперёд ИЛИ назад) — таймер больше не нужен.
    ; Если уйдём назад, leave-функция не вызывается, поэтому гасим
    ; таймер именно здесь.
    ${NSD_KillTimer} LBoxTimerFunc
  FunctionEnd

  ; Leave-функция: если загрузка компонентов ещё идёт — не даём уйти со
  ; страницы. Abort в leave-функции отменяет переход на следующую
  ; страницу, но НЕ прерывает установку приложения.
  Function LBoxPageLeave
    ${If} $LBoxStarted == "1"
      Call LBoxIsFinished
      ${If} $LBoxValue != "1"
        ; Загрузка ещё идёт — предупреждаем и остаёмся на странице.
        ${NSD_SetText} $LBoxLblStatus "$(LBOX_WAITING)"
        Call LBoxRedraw
        MessageBox MB_OK|MB_ICONINFORMATION "$(LBOX_STILL_BUSY)"
        Abort
      ${EndIf}
      StrCpy $LBoxStarted "2"
      Call LBoxApplyResult
    ${ElseIf} $LBoxStarted == "0"
      ; Загрузка ещё не запускалась (например, страницу открыли заново) —
      ; запускаем её и остаёмся на странице.
      ${If} $LBoxMissing == "1"
        ${If} $LBoxNoPs == "0"
          Call LBoxStartDownload
          ${NSD_KillTimer} LBoxTimerFunc
          ${NSD_CreateTimer} LBoxTimerFunc 500
          MessageBox MB_OK|MB_ICONINFORMATION "$(LBOX_JUST_STARTED)"
          Abort
        ${EndIf}
      ${EndIf}
    ${EndIf}
  FunctionEnd

  PageEx custom
    PageCallbacks LBoxPageCreate LBoxPageLeave
    Caption " "
  PageExEnd
!macroend

; ---------------------------------------------------------------------------
; Всё выше работает только в сборке установщика. В сборке ансталлера
; (BUILD_UNINSTALLER) ни customInit, ни customPageAfterChangeDir не
; подключаются, и функции остались бы «неиспользуемыми» — makensis
; ругается warning 6010 (а electron-builder собирает с -WX, т.е. warnings
; как errors).
!endif ; !ifndef BUILD_UNINSTALLER
