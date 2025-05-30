import { run } from "@jxa/run";
import { runAppleScript } from "run-applescript";

async function checkMailAccess(): Promise<boolean> {
  try {
    // First check if Mail is running
    const isRunning = await runAppleScript(`
tell application "System Events"
    return application process "Mail" exists
end tell`);

    if (isRunning !== "true") {
      console.error("Mail app is not running, attempting to launch...");
      try {
        await runAppleScript(`
tell application "Mail" to activate
delay 2`);
      } catch (activateError) {
        console.error("Error activating Mail app:", activateError);
        throw new Error(
          "Could not activate Mail app. Please start it manually.",
        );
      }
    }

    // Try to get the count of mailboxes as a simple test
    try {
      await runAppleScript(`
tell application "Mail"
    count every mailbox
end tell`);
      return true;
    } catch (mailboxError) {
      console.error("Error accessing mailboxes:", mailboxError);

      // Try an alternative check
      try {
        const mailVersion = await runAppleScript(`
tell application "Mail"
    return its version
end tell`);
        console.error("Mail version:", mailVersion);
        return true;
      } catch (versionError) {
        console.error("Error getting Mail version:", versionError);
        throw new Error(
          "Mail app is running but cannot access mailboxes. Please check permissions and configuration.",
        );
      }
    }
  } catch (error) {
    console.error("Mail access check failed:", error);
    throw new Error(
      `Cannot access Mail app. Please make sure Mail is running and properly configured. Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface EmailMessage {
  subject: string;
  sender: string;
  dateSent: string;
  content: string;
  isRead: boolean;
  mailbox: string;
}

async function getUnreadMails(limit = 10): Promise<EmailMessage[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    // First, try with AppleScript which might be more reliable for this case
    try {
      const script = `
tell application "Mail"
    set allMailboxes to every mailbox
    set resultList to {}

    repeat with m in allMailboxes
        try
            set unreadMessages to (messages of m whose read status is false)
            if (count of unreadMessages) > 0 then
                set msgLimit to ${limit}
                if (count of unreadMessages) < msgLimit then
                    set msgLimit to (count of unreadMessages)
                end if

                repeat with i from 1 to msgLimit
                    try
                        set currentMsg to item i of unreadMessages
                        set msgData to {subject:(subject of currentMsg), sender:(sender of currentMsg), ¬
                                        date:(date sent of currentMsg) as string, mailbox:(name of m)}

                        try
                            set msgContent to content of currentMsg
                            if length of msgContent > 500 then
                                set msgContent to (text 1 thru 500 of msgContent) & "..."
                            end if
                            set msgData to msgData & {content:msgContent}
                        on error
                            set msgData to msgData & {content:"[Content not available]"}
                        end try

                        set end of resultList to msgData
                    end try
                end repeat

                if (count of resultList) ≥ ${limit} then exit repeat
            end if
        end try
    end repeat

    return resultList
end tell`;

      const asResult = await runAppleScript(script);

      // If we got results, parse them
      if (asResult && asResult.toString().trim().length > 0) {
        try {
          // Try to parse as JSON if the result looks like JSON
          if (asResult.startsWith("{") || asResult.startsWith("[")) {
            const parsedResults = JSON.parse(asResult);
            if (Array.isArray(parsedResults) && parsedResults.length > 0) {
              return parsedResults.map((msg) => ({
                subject: msg.subject || "No subject",
                sender: msg.sender || "Unknown sender",
                dateSent: msg.date || new Date().toString(),
                content: msg.content || "[Content not available]",
                isRead: false, // These are all unread by definition
                mailbox: msg.mailbox || "Unknown mailbox",
              }));
            }
          }

          // If it's not in JSON format, try to parse the plist/record format
          const parsedEmails: EmailMessage[] = [];

          // Very simple parsing for the record format that AppleScript might return
          // This is a best-effort attempt and might not be perfect
          const matches = asResult.match(/\{([^}]+)\}/g);
          if (matches && matches.length > 0) {
            for (const match of matches) {
              try {
                // Parse key-value pairs
                const props = match.substring(1, match.length - 1).split(",");
                const emailData: { [key: string]: string } = {};

                for (const prop of props) {
                  const parts = prop.split(":");
                  if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join(":").trim();
                    emailData[key] = value;
                  }
                }

                if (emailData.subject || emailData.sender) {
                  parsedEmails.push({
                    subject: emailData.subject || "No subject",
                    sender: emailData.sender || "Unknown sender",
                    dateSent: emailData.date || new Date().toString(),
                    content: emailData.content || "[Content not available]",
                    isRead: false,
                    mailbox: emailData.mailbox || "Unknown mailbox",
                  });
                }
              } catch (parseError) {
                console.error("Error parsing email match:", parseError);
              }
            }
          }

          if (parsedEmails.length > 0) {
            return parsedEmails;
          }
        } catch (parseError) {
          console.error("Error parsing AppleScript result:", parseError);
          // If parsing failed, continue to the JXA approach
        }
      }

      // If the raw result contains useful info but parsing failed
      if (
        asResult.includes("subject") &&
        asResult.includes("sender")
      ) {
        console.error("Returning raw AppleScript result for debugging");
        return [
          {
            subject: "Raw AppleScript Output",
            sender: "Mail System",
            dateSent: new Date().toString(),
            content: `Could not parse Mail data properly. Raw output: ${asResult}`,
            isRead: false,
            mailbox: "Debug",
          },
        ];
      }
    } catch (asError) {
      // Continue to JXA approach as fallback
    }

    console.error("Trying JXA approach for unread emails...");
    // Check Mail accounts as a different approach
    const accounts = await runAppleScript(`
tell application "Mail"
    set accts to {}
    repeat with a in accounts
        set end of accts to name of a
    end repeat
    return accts
end tell`);
    console.error("Available accounts:", accounts);

    // Try using direct AppleScript to check for unread messages across all accounts
    const unreadInfo = await runAppleScript(`
tell application "Mail"
    set unreadInfo to {}
    repeat with m in every mailbox
        try
            set unreadCount to count (messages of m whose read status is false)
            if unreadCount > 0 then
                set end of unreadInfo to {name of m, unreadCount}
            end if
        end try
    end repeat
    return unreadInfo
end tell`);
    console.error("Mailboxes with unread messages:", unreadInfo);

    // Fallback to JXA approach
    const unreadMails: EmailMessage[] = await run((limit: number) => {
      const Mail = Application("Mail");
      const results = [];

      try {
        const accounts = Mail.accounts();

        for (const account of accounts) {
          try {
            const accountName = account.name();
            try {
              const accountMailboxes = account.mailboxes();

              for (const mailbox of accountMailboxes) {
                try {
                  const boxName = mailbox.name();

                  // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
                  let unreadMessages;
                  try {
                    unreadMessages = mailbox.messages.whose({
                      readStatus: false,
                    })();

                    const count = Math.min(
                      unreadMessages.length,
                      limit - results.length,
                    );
                    for (let i = 0; i < count; i++) {
                      try {
                        const msg = unreadMessages[i];
                        results.push({
                          subject: msg.subject(),
                          sender: msg.sender(),
                          dateSent: msg.dateSent().toString(),
                          content: msg.content()
                            ? msg.content().substring(0, 500)
                            : "[No content]",
                          isRead: false,
                          mailbox: `${accountName} - ${boxName}`,
                        });
                      } catch (msgError) {}
                    }
                  } catch (unreadError) {}
                } catch (boxError) {}

                if (results.length >= limit) {
                  break;
                }
              }
            } catch (mbError) {}

            if (results.length >= limit) {
              break;
            }
          } catch (accError) {}
        }
      } catch (error) {}

      return results;
    }, limit);

    return unreadMails;
  } catch (error) {
    console.error("Error in getUnreadMails:", error);
    throw new Error(
      `Error accessing mail: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function searchMails(
  searchTerm: string,
  limit = 10,
): Promise<EmailMessage[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    // Ensure Mail app is running
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 2
end if`);

    // First try the AppleScript approach which might be more reliable
    try {
      const script = `
tell application "Mail"
    set searchString to "${searchTerm.replace(/"/g, '\\"')}"
    set foundMsgs to {}
    set allBoxes to every mailbox

    repeat with currentBox in allBoxes
        try
            set boxMsgs to (messages of currentBox whose (subject contains searchString) or (content contains searchString))
            set foundMsgs to foundMsgs & boxMsgs
            if (count of foundMsgs) ≥ ${limit} then exit repeat
        end try
    end repeat

    set resultList to {}
    set msgCount to (count of foundMsgs)
    if msgCount > ${limit} then set msgCount to ${limit}

    repeat with i from 1 to msgCount
        try
            set currentMsg to item i of foundMsgs
            set msgInfo to {subject:subject of currentMsg, sender:sender of currentMsg, ¬
                            date:(date sent of currentMsg) as string, isRead:read status of currentMsg, ¬
                            boxName:name of (mailbox of currentMsg)}
            set end of resultList to msgInfo
        end try
    end repeat

    return resultList
end tell`;

      const asResult = await runAppleScript(script);

      // If we got results, parse them
      if (asResult && asResult.length > 0) {
        try {
          const parsedResults = JSON.parse(asResult);
          if (Array.isArray(parsedResults) && parsedResults.length > 0) {
            return parsedResults.map((msg) => ({
              subject: msg.subject || "No subject",
              sender: msg.sender || "Unknown sender",
              dateSent: msg.date || new Date().toString(),
              content: "[Content not available through AppleScript method]",
              isRead: msg.isRead || false,
              mailbox: msg.boxName || "Unknown mailbox",
            }));
          }
        } catch (parseError) {
          console.error("Error parsing AppleScript result:", parseError);
          // Continue to JXA approach if parsing fails
        }
      }
    } catch (asError) {
      // Continue to JXA approach
    }

    // JXA approach as fallback
    const searchResults: EmailMessage[] = await run(
      (searchTerm: string, limit: number) => {
        const Mail = Application("Mail");
        const results = [];

        try {
          const mailboxes = Mail.mailboxes();

          for (const mailbox of mailboxes) {
            try {
              // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
              let messages;
              try {
                messages = mailbox.messages.whose({
                  _or: [
                    { subject: { _contains: searchTerm } },
                    { content: { _contains: searchTerm } },
                  ],
                })();

                const count = Math.min(messages.length, limit);

                for (let i = 0; i < count; i++) {
                  try {
                    const msg = messages[i];
                    results.push({
                      subject: msg.subject(),
                      sender: msg.sender(),
                      dateSent: msg.dateSent().toString(),
                      content: msg.content()
                        ? msg.content().substring(0, 500)
                        : "[No content]", // Limit content length
                      isRead: msg.readStatus(),
                      mailbox: mailbox.name(),
                    });
                  } catch (msgError) {}
                }

                if (results.length >= limit) {
                  break;
                }
              } catch (queryError) {
              }
            } catch (boxError) {}
          }
        } catch (mbError) {}

        return results.slice(0, limit);
      },
      searchTerm,
      limit,
    );

    return searchResults;
  } catch (error) {
    console.error("Error in searchMails:", error);
    throw new Error(
      `Error searching mail: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function sendMail(
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
): Promise<string | undefined> {
  try {
    if (!(await checkMailAccess())) {
      throw new Error("Could not access Mail app");
    }

    // Ensure Mail app is running
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 2
end if`);

    // Escape special characters in strings for AppleScript
    const escapedTo = to.replace(/"/g, '\\"');
    const escapedSubject = subject.replace(/"/g, '\\"');
    const escapedBody = body.replace(/"/g, '\\"');
    const escapedCc = cc ? cc.replace(/"/g, '\\"') : "";
    const escapedBcc = bcc ? bcc.replace(/"/g, '\\"') : "";

    let script = `
tell application "Mail"
    set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedBody}", visible:true}
    tell newMessage
        make new to recipient with properties {address:"${escapedTo}"}
`;

    if (cc) {
      script += `        make new cc recipient with properties {address:"${escapedCc}"}\n`;
    }

    if (bcc) {
      script += `        make new bcc recipient with properties {address:"${escapedBcc}"}\n`;
    }

    script += `    end tell
    send newMessage
    return "success"
end tell
`;

    try {
      const result = await runAppleScript(script);
      if (result === "success") {
        return `Email sent to ${to} with subject "${subject}"`;
      // biome-ignore lint/style/noUselessElse: <explanation>
      } else {
      }
    } catch (asError) {
      console.error("Error in AppleScript send:", asError);

      const jxaResult: string = await run(
        (to, subject, body, cc, bcc) => {
          try {
            const Mail = Application("Mail");

            const msg = Mail.OutgoingMessage().make();
            msg.subject = subject;
            msg.content = body;
            msg.visible = true;

            // Add recipients
            const toRecipient = Mail.ToRecipient().make();
            toRecipient.address = to;
            msg.toRecipients.push(toRecipient);

            if (cc) {
              const ccRecipient = Mail.CcRecipient().make();
              ccRecipient.address = cc;
              msg.ccRecipients.push(ccRecipient);
            }

            if (bcc) {
              const bccRecipient = Mail.BccRecipient().make();
              bccRecipient.address = bcc;
              msg.bccRecipients.push(bccRecipient);
            }

            msg.send();
            return "JXA send completed";
          } catch (error) {
            return `JXA error: ${error}`;
          }
        },
        to,
        subject,
        body,
        cc,
        bcc,
      );

      if (jxaResult.startsWith("JXA error:")) {
        throw new Error(jxaResult);
      }

      return `Email sent to ${to} with subject "${subject}"`;
    }
  } catch (error) {
    console.error("Error in sendMail:", error);
    throw new Error(
      `Error sending mail: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function getMailboxes(): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    // Ensure Mail app is running
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 2
end if`);

    const mailboxes: string[] = await run(() => {
      const Mail = Application("Mail");

      try {
        const mailboxes = Mail.mailboxes();

        if (!mailboxes || mailboxes.length === 0) {
          try {
            const result = Mail.execute({
              withObjectModel: "Mail Suite",
              withCommand: "get name of every mailbox",
            });

            if (result && result.length > 0) {
              return result;
            }
          } catch (execError) {}

          return [];
        }

        return mailboxes.map((box: unknown) => {
          try {
            return (box as { name: () => string }).name();
          } catch (nameError) {
            return "Unknown mailbox";
          }
        });
      } catch (error) {
        return [];
      }
    });

    return mailboxes;
  } catch (error) {
    console.error("Error in getMailboxes:", error);
    throw new Error(
      `Error getting mailboxes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function getAccounts(): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const accounts = await runAppleScript(`
tell application "Mail"
    set acctNames to {}
    repeat with a in accounts
        set end of acctNames to name of a
    end repeat
    return acctNames
end tell`);

    return accounts ? accounts.split(", ") : [];
  } catch (error) {
    console.error("Error getting accounts:", error);
    throw new Error(
      `Error getting mail accounts: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function getMailboxesForAccount(accountName: string): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const mailboxes = await runAppleScript(`
tell application "Mail"
    set boxNames to {}
    try
        set targetAccount to first account whose name is "${accountName.replace(/"/g, '\\"')}"
        set acctMailboxes to every mailbox of targetAccount
        repeat with mb in acctMailboxes
            set end of boxNames to name of mb
        end repeat
    on error errMsg
        return "Error: " & errMsg
    end try
    return boxNames
end tell`);

    if (mailboxes?.startsWith("Error:")) {
      console.error(mailboxes);
      return [];
    }

    return mailboxes ? mailboxes.split(", ") : [];
  } catch (error) {
    console.error("Error getting mailboxes for account:", error);
    throw new Error(
      `Error getting mailboxes for account ${accountName}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface EmailIdentifier {
  subject?: string;
  sender?: string;
  dateSent?: string;
  messageId?: string;
}

/**
 * Creates a new mailbox/folder in the Mail app
 * @param mailboxName - Name of the mailbox to create
 * @param accountName - Optional account name to create the mailbox in
 * @param parentMailboxName - Optional parent mailbox to create this mailbox under
 * @returns Promise that resolves to a success message
 */
async function createMailbox(
  mailboxName: string,
  accountName?: string,
  parentMailboxName?: string,
): Promise<string> {
  try {
    if (!(await checkMailAccess())) {
      throw new Error("Could not access Mail app");
    }

    // Ensure Mail app is running
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 2
end if`);

    const escapedMailboxName = mailboxName.replace(/"/g, '\\"');
    const escapedAccountName = accountName ? accountName.replace(/"/g, '\\"') : "";
    const escapedParentMailboxName = parentMailboxName ? parentMailboxName.replace(/"/g, '\\"') : "";

    let script = '';

    if (accountName) {
      if (parentMailboxName) {
        // Create mailbox under a parent mailbox in specific account
        script = `
tell application "Mail"
    try
        set targetAccount to first account whose name is "${escapedAccountName}"
        set parentBox to first mailbox of targetAccount whose name is "${escapedParentMailboxName}"
        make new mailbox with properties {name:"${escapedMailboxName}"} at parentBox
        return "success"
    on error errMsg
        return "Error: " & errMsg
    end try
end tell`;
      } else {
        // Create mailbox at root level of specific account
        script = `
tell application "Mail"
    try
        set targetAccount to first account whose name is "${escapedAccountName}"
        make new mailbox with properties {name:"${escapedMailboxName}"} at targetAccount
        return "success"
    on error errMsg
        return "Error: " & errMsg
    end try
end tell`;
      }
    } else {
      // Create mailbox in first available account
      script = `
tell application "Mail"
    try
        set firstAccount to first account
        make new mailbox with properties {name:"${escapedMailboxName}"} at firstAccount
        return "success"
    on error errMsg
        return "Error: " & errMsg
    end try
end tell`;
    }

    const result = await runAppleScript(script);

    if (result === "success") {
      const location = accountName 
        ? (parentMailboxName ? `${accountName}/${parentMailboxName}` : accountName)
        : "default account";
      return `Mailbox "${mailboxName}" created successfully in ${location}`;
    } else if (result.startsWith("Error:")) {
      throw new Error(result);
    } else {
      throw new Error(`Unexpected result: ${result}`);
    }
  } catch (error) {
    console.error("Error in createMailbox:", error);
    throw new Error(
      `Error creating mailbox: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Helper function to create EmailIdentifier from EmailMessage
 * @param email - EmailMessage object to convert
 * @returns EmailIdentifier object
 */
function createEmailIdentifier(email: EmailMessage): EmailIdentifier {
  return {
    subject: email.subject,
    sender: email.sender,
    dateSent: email.dateSent,
  };
}

/**
 * Moves emails to a specific mailbox/folder
 * @param emailIdentifiers - Array of email identifiers to find and move
 * @param targetMailboxName - Name of the target mailbox to move emails to
 * @param sourceMailboxName - Optional source mailbox to search in (if not provided, searches all mailboxes)
 * @returns Promise that resolves to a summary of the move operation
 */
async function moveEmailsToMailbox(
  emailIdentifiers: EmailIdentifier[],
  targetMailboxName: string,
  sourceMailboxName?: string,
): Promise<string> {
  try {
    if (!(await checkMailAccess())) {
      throw new Error("Could not access Mail app");
    }

    // Ensure Mail app is running and give it time to refresh mailboxes
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 2
end if

-- Force refresh of mailboxes to ensure newly created ones are available
tell application "Mail"
    try
        -- Trigger a mailbox refresh by getting the count
        set mailboxCount to count of every mailbox
        delay 1
    end try
end tell`);

    const escapedTargetMailbox = targetMailboxName.replace(/"/g, '\\"');
    const escapedSourceMailbox = sourceMailboxName ? sourceMailboxName.replace(/"/g, '\\"') : "";

    let movedCount = 0;
    const errors: string[] = [];

    for (const identifier of emailIdentifiers) {
      try {
        let searchConditions: string[] = [];

        if (identifier.subject) {
          searchConditions.push(`subject contains "${identifier.subject.replace(/"/g, '\\"')}"`);
        }
        if (identifier.sender) {
          searchConditions.push(`sender contains "${identifier.sender.replace(/"/g, '\\"')}"`);
        }
        if (identifier.dateSent) {
          searchConditions.push(`date sent is "${identifier.dateSent.replace(/"/g, '\\"')}"`);
        }

        if (searchConditions.length === 0) {
          errors.push("No valid identifier provided for one email");
          continue;
        }

        const whereClause = searchConditions.join(" and ");

        let script = '';
        if (sourceMailboxName) {
          // Search within specific mailbox
          script = `
tell application "Mail"
    try
        -- Find source mailbox with better error handling
        set sourceBox to missing value
        set allMailboxes to every mailbox
        repeat with mb in allMailboxes
            if name of mb is "${escapedSourceMailbox}" then
                set sourceBox to mb
                exit repeat
            end if
        end repeat
        
        if sourceBox is missing value then
            return "Error: Source mailbox '${escapedSourceMailbox}' not found"
        end if
        
        -- Find target mailbox with better error handling
        set targetBox to missing value
        repeat with mb in allMailboxes
            if name of mb is "${escapedTargetMailbox}" then
                set targetBox to mb
                exit repeat
            end if
        end repeat
        
        if targetBox is missing value then
            return "Error: Target mailbox '${escapedTargetMailbox}' not found"
        end if
        
        set foundMessages to (messages of sourceBox whose ${whereClause})
        
        if (count of foundMessages) > 0 then
            repeat with msg in foundMessages
                move msg to targetBox
            end repeat
            return "moved:" & (count of foundMessages)
        else
            return "notfound"
        end if
    on error errMsg
        return "Error: " & errMsg
    end try
end tell`;
        } else {
          // Search across all mailboxes
          script = `
tell application "Mail"
    try
        -- Get all mailboxes and find target
        set allMailboxes to every mailbox
        set targetBox to missing value
        repeat with mb in allMailboxes
            if name of mb is "${escapedTargetMailbox}" then
                set targetBox to mb
                exit repeat
            end if
        end repeat
        
        if targetBox is missing value then
            return "Error: Target mailbox '${escapedTargetMailbox}' not found. Available mailboxes: " & (name of every mailbox as string)
        end if
        
        set foundMessages to {}
        
        repeat with currentBox in allMailboxes
            try
                set boxMessages to (messages of currentBox whose ${whereClause})
                set foundMessages to foundMessages & boxMessages
            on error
                -- Skip problematic mailboxes
            end try
        end repeat
        
        if (count of foundMessages) > 0 then
            repeat with msg in foundMessages
                move msg to targetBox
            end repeat
            return "moved:" & (count of foundMessages)
        else
            return "notfound"
        end if
    on error errMsg
        return "Error: " & errMsg
    end try
end tell`;
        }

        const result = await runAppleScript(script);

        if (result.startsWith("moved:")) {
          const count = parseInt(result.split(":")[1]);
          movedCount += count;
        } else if (result === "notfound") {
          errors.push(`Email not found with criteria: ${JSON.stringify(identifier)}`);
        } else if (result.startsWith("Error:")) {
          errors.push(`Error moving email: ${result}`);
        }
      } catch (emailError) {
        errors.push(`Error processing email ${JSON.stringify(identifier)}: ${emailError}`);
      }
    }

    let resultMessage = `Moved ${movedCount} email(s) to "${targetMailboxName}"`;
    if (errors.length > 0) {
      resultMessage += `\nErrors encountered: ${errors.join("; ")}`;
    }

    return resultMessage;
  } catch (error) {
    console.error("Error in moveEmailsToMailbox:", error);
    throw new Error(
      `Error moving emails: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Helper function to move emails by search criteria (simpler interface)
 * @param searchCriteria - Simple search criteria object
 * @param targetMailboxName - Name of the target mailbox to move emails to
 * @param sourceMailboxName - Optional source mailbox to search in
 * @returns Promise that resolves to a summary of the move operation
 */
async function moveEmailsBySearch(
  searchCriteria: {
    subject?: string;
    sender?: string;
    keyword?: string;
  },
  targetMailboxName: string,
  sourceMailboxName?: string,
): Promise<string> {
  // Convert simple criteria to EmailIdentifier format
  const emailIdentifiers: EmailIdentifier[] = [];
  
  if (searchCriteria.keyword) {
    // If keyword provided, search by subject containing keyword
    emailIdentifiers.push({ subject: searchCriteria.keyword });
  } else {
    // Use provided subject and/or sender
    const identifier: EmailIdentifier = {};
    if (searchCriteria.subject) identifier.subject = searchCriteria.subject;
    if (searchCriteria.sender) identifier.sender = searchCriteria.sender;
    
    if (Object.keys(identifier).length > 0) {
      emailIdentifiers.push(identifier);
    }
  }
  
  if (emailIdentifiers.length === 0) {
    throw new Error("No valid search criteria provided");
  }
  
  return moveEmailsToMailbox(emailIdentifiers, targetMailboxName, sourceMailboxName);
}

export default {
  getUnreadMails,
  searchMails,
  sendMail,
  getMailboxes,
  getAccounts,
  getMailboxesForAccount,
  createMailbox,
  createEmailIdentifier,
  moveEmailsToMailbox,
  moveEmailsBySearch,
};
