# Sets up the automatic weekly run: every Monday at 8:00 am.
# If the PC is off at 8:00, it runs as soon as the PC is next switched on.
# To remove it later:  Unregister-ScheduledTask -TaskName "BirthdayBeat weekly" -Confirm:$false
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$action = New-ScheduledTaskAction -Execute (Join-Path $dir 'run-weekly.cmd') -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 8:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName 'BirthdayBeat weekly' -Action $action -Trigger $trigger -Settings $settings -Description 'Creates the weekly customer birthday PDF and card images (BirthdayBeat). Sends nothing.' -Force | Out-Null
Write-Output "Installed. Next run: $((Get-ScheduledTask -TaskName 'BirthdayBeat weekly' | Get-ScheduledTaskInfo).NextRunTime)"
