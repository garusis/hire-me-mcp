# #78 launch collateral — vhs (https://github.com/charmbracelet/vhs) tape.
#
# Records a REAL MCP session: scripts/demo/mcp-session-demo.mjs connects to
# the LIVE production endpoint (https://hire-me-mcp-web.vercel.app/api/mcp)
# and prints the actual JSON-RPC responses. Nothing here is staged output —
# regenerate the GIF any time with:
#
#   vhs docs/assets/mcp-demo.tape
#
# which re-runs the real network calls and re-captures whatever the live
# server returns at that moment.

Output docs/assets/mcp-demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1000
Set Height 560
Set Padding 20
Set Theme "Dracula"
Set TypingSpeed 40ms

Type "node scripts/demo/mcp-session-demo.mjs"
Sleep 500ms
Enter
Sleep 6s
