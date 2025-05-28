# Apple MCP Tools Enhanced

[![npm version](https://img.shields.io/npm/v/@chrimerss/apple-mcp-enhanced.svg)](https://www.npmjs.com/package/@chrimerss/apple-mcp-enhanced)

This is an enhanced collection of apple-native tools for the [MCP protocol](https://modelcontextprotocol.com/docs/mcp-protocol) with **advanced email folder management capabilities**.

## 🚀 What's New in Enhanced Version

- ✨ **Create email folders/mailboxes** with support for nested folders
- 📧 **Move emails to folders** using flexible search criteria
- 🗂️ **Email organization tools** for better inbox management
- 📁 **Account-specific folder creation** for multi-account setups

<details>
<summary>Here's the JSON to copy for Claude Desktop</summary>

```json
{
  "mcpServers": {
    "apple-mcp-enhanced": {
      "command": "npx",
      "args": ["@chrimerss/apple-mcp-enhanced@latest"]
    }
  }
}
```

</details>

#### Quick install

To install the Enhanced Apple MCP for Claude Desktop:

```bash
npx @chrimerss/apple-mcp-enhanced@latest
```

Or add it to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "apple-mcp-enhanced": {
      "command": "npx", 
      "args": ["@chrimerss/apple-mcp-enhanced@latest"]
    }
  }
}
```

## Features

- Messages:
  - Send messages using the Apple Messages app
  - Read out messages
- Notes:
  - List notes
  - Search & read notes in Apple Notes app
- Contacts:
  - Search contacts for sending messages
- Emails:
  - Send emails with multiple recipients (to, cc, bcc) and file attachments
  - Search emails with custom queries, mailbox selection, and result limits
  - Schedule emails for future delivery
  - List and manage scheduled emails
  - Check unread email counts globally or per mailbox
  - **NEW: Create mailboxes/folders** with support for nested folders and account-specific creation
  - **NEW: Move emails to folders** with flexible search criteria (subject, sender, date)
  - **NEW: Email organization tools** for better inbox management
- Reminders:
  - List all reminders and reminder lists
  - Search for reminders by text
  - Create new reminders with optional due dates and notes
  - Open the Reminders app to view specific reminders
- Calendar:
  - Search calendar events with customizable date ranges
  - List upcoming events
  - Create new calendar events with details like title, location, and notes
  - Open calendar events in the Calendar app
- Web Search:
  - Search the web using DuckDuckGo
  - Retrieve and process content from search results
- Maps:
  - Search for locations and addresses
  - Save locations to favorites
  - Get directions between locations
  - Drop pins on the map
  - Create and list guides
  - Add places to guides

- TODO: Search and open photos in Apple Photos app
- TODO: Search and open music in Apple Music app

## Email Folder Management Examples

With the new email folder management features, you can now:

```
Create a new folder called "Important Projects" in my work email account
```

```
Move all emails from John Doe about the quarterly report to the "Q4 Reports" folder
```

```
Create a nested folder "Archive" under "Important Projects" and move old emails there
```

```
Organize my inbox by moving all emails with "meeting" in the subject to a "Meetings" folder
```

You can also daisy-chain commands to create a workflow. Like:
"can you please read the note about people i met in the conference, find their contacts and emails, and send them a message saying thank you for the time."

(it works!)


#### Manual installation

You just need bun, install with `brew install oven-sh/bun/bun`

Now, edit your `claude_desktop_config.json` with this:

```json
{
  "mcpServers": {
    "apple-mcp-enhanced": {
      "command": "npx",
      "args": ["@chrimerss/apple-mcp-enhanced@latest"]
    }
  }
}
```

### Usage

Now, ask Claude to use the `apple-mcp-enhanced` tool.

```
Can you send a message to John Doe?
```

```
find all the notes related to AI and send it to my girlfriend
```

```
create a reminder to "Buy groceries" for tomorrow at 5pm
```

```
Create a folder called "Work Projects" and move all emails from my boss to it
```

## Local Development

```bash
git clone https://github.com/chrimerss/apple-mcp.git
cd apple-mcp
bun install
bun run index.ts
```

enjoy!
