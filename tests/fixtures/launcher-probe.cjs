// Exercise the real batch launcher without opening a GUI, then shut down its server.
process.argv.push('--no-open')
setTimeout(() => process.exit(0), 3000)
