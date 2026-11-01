#Requires -RunAsAdministrator
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$ruleName = "GitHubWebsite-LAN-$Port"
$options = @{
  Direction = 'Inbound'
  Action = 'Allow'
  Enabled = 'True'
  Profile = 'Any'
  Program = $nodePath
  Protocol = 'TCP'
  LocalPort = $Port
  RemoteAddress = 'LocalSubnet'
}
if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
  Set-NetFirewallRule -Name $ruleName @options
} else {
  New-NetFirewallRule -Name $ruleName -DisplayName "GitHub Website LAN ($Port)" @options | Out-Null
}
Write-Output "Allowed TCP $Port from the local subnet. Existing firewall rules are preserved."
