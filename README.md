# OrderFlow Invest

OrderFlow Invest is a standalone, offline Windows paper-trading terminal. It uses fictional equities, simulated executions, and virtual money. It is not a brokerage, has no live market feed, and is not affiliated with PhonePe or any exchange.

## Install on Windows

Download `OrderFlow-Invest-1.0.0-x64.msi` from the [GitHub release](https://github.com/NaveenGH-Insight/OrderFlow-Invest/releases/tag/v1.0.0). Run the MSI and open **OrderFlow Invest** from the Start menu or desktop shortcut. The MSI targets Windows x64, installs per user, and bundles its Electron runtime; using the app requires neither Node.js nor internet access. This build is unsigned, so Windows may display an unknown-publisher or SmartScreen warning. Check the release's SHA-256 before running it; do not bypass restrictions on a managed device.

```powershell
Get-FileHash .\OrderFlow-Invest-1.0.0-x64.msi -Algorithm SHA256
```

## Use the terminal

- Open the instrument finder with **Ctrl+K**. Search by company, symbol, or sector; use the plus or bookmark to manage your watchlist. Select a row to see its quote and chart.
- Choose **30m**, **1h**, or **2h**. Each candle aggregates six simulated market executions into open, high, low, close, and volume. Hover over the chart to inspect individual bars. Benchmarks are equally weighted normalized prices of their fictional components (base 10,000), with changes measured over one simulated hour.
- Select **Buy** or **Sell**, enter a whole number of shares, and submit a simulated market order. The order fills at the then-current quote. The account starts with ₹1,00,000 in virtual cash; insufficient buying power and sales beyond owned shares are rejected.
- Use **Portfolio** for holdings, average acquisition cost, market value, and realized/unrealized P&L. **Order history** lists individual fills. Portfolio accounting uses integer paise and weighted-average cost, with sub-paise rounding carried in the remaining position until it closes.
- One simulated minute passes approximately every seven seconds while the app runs. Pause and resume using the simulation badge. Simulation time does not advance while the app is closed, prices do not represent real instruments, and paper fills do not impact the synthetic feed. There are no limit orders, fees, short sales, funds, options, real deposits, or withdrawals.

The market state, portfolio, order history, and watchlist are stored locally in the app profile (`%APPDATA%\OrderFlow Invest` by default), not sent to a server. An ordinary reinstall does not reset that profile.

## Build and verify from source

Use Node.js 24 and PowerShell on Windows x64:

```powershell
npm ci
npm test
npm start
# Close the development app before the next commands.
npm run smoke
npm run dist
```

The MSI is written under `dist`. To exercise the exact release app without changing your installed apps, use Windows Installer's administrative extraction and then run the desktop smoke test on the extracted executable:

```powershell
$msi = (Resolve-Path .\dist\OrderFlow-Invest-1.0.0-x64.msi).Path
$extract = Join-Path $env:TEMP ('OrderFlowInvest-' + [guid]::NewGuid())
$result = Start-Process msiexec.exe -Wait -PassThru -ArgumentList "/a `"$msi`" /qn TARGETDIR=`"$extract`""
if ($result.ExitCode -ne 0) { throw "MSI extraction failed: $($result.ExitCode)" }
$exe = Get-ChildItem $extract -Filter 'OrderFlow Invest.exe' -Recurse | Select-Object -First 1
if (!$exe) { throw 'The packaged executable was not found' }
npm run smoke -- "$($exe.FullName)"
```

The smoke test checks startup, candlestick ranges, watchlist selection, a simulated fill, a rejected oversell, holdings and history updates, and persistence across restarts in a temporary profile. Administrative extraction is **not** a clean-machine test of the interactive installer, shortcut registration, or uninstall.
