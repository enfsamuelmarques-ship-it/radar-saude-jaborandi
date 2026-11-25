' Roda o monitor sem abrir janela preta. Usado pelo Agendador de Tarefas do Windows.
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = pasta
sh.Run """C:\Program Files\nodejs\node.exe"" """ & pasta & "\monitor.js""", 0, False
