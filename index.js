const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid')
const { exec } = require('child_process');;
const crypto = require('crypto');
const app = express();
app.use(express.json());

function generateRandomString() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const formatted = `${year}-${month}-${minutes}`;

    const secretKey = `templkt-${formatted}`;


    const hash = crypto.createHash('sha256').update(secretKey).digest('hex');
    return hash

}
const DOMAIN = 'your_domain.com'; 

//can you add db 
const emailsFile = './emails.json';



function loadEmails() {
    try {
        if (!fs.existsSync(emailsFile)) return [];

        const content = fs.readFileSync(emailsFile, 'utf-8').trim();

        if (!content) return [];

        return JSON.parse(content);
    } catch (err) {
        console.error('❌ خطأ في قراءة ملف الإيميلات:', err.message);
        return [];
    }
}

function saveEmails(emails) {
    try {
        fs.writeFileSync(emailsFile, JSON.stringify(emails, null, 2), 'utf-8');
    } catch (err) {
        console.error('❌ خطأ في حفظ ملف الإيميلات:', err.message);
    }
}

function generateEmail() {
    const username = uuidv4().slice(0, 8);
    return `${username}@${DOMAIN}`;
}

app.post('/generate', (req, res) => {
    try {
        const datemail = req.headers['datemail'];
        const apiKey = req.headers['secret-key'];
        const id_app = req.headers['id-app'];


        const hash = generateRandomString();
        console.log("API Key:", apiKey);
        console.log("Generated Hash:", hash);
        if (apiKey == hash) {
            let emails = loadEmails();
            const newEmail = generateEmail();

            if (emails.includes(newEmail)) {
                res.json({ data: 'Generated email already exists' });

            }

            emails.push({ email: newEmail, id_app: id_app, datemail: datemail });
            saveEmails(emails);

            res.json({ email: newEmail, id_app: id_app, datemail: datemail });
        } else {
            res.json({ data: 'Invalid API key' });
        }

    } catch (err) {
        console.error('Error generating email:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.post('/generate-custom/:email', (req, res) => {
    try {
        const datemail = req.headers['datemail'];
        const apiKey = req.headers['secret-key'];
        const id_app = req.headers['id-app'];

        const hash = generateRandomString();

        if (apiKey == hash) {
            const email = req.params.email.toLowerCase();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(email)) {
                return res.json({ data: 'Invalid email format' });
            }

            let emails = loadEmails();

            if (emails.find(e => e.email === email)) {
                return res.json({ data: 'Email already exists' });
            }

            emails.push({ email, id_app: id_app, datemail: datemail });
            saveEmails(emails);

            res.json({ email, id_app: id_app, datemail: datemail });
        } else {
            res.json({ data: 'Invalid API key' });
        }

    } catch (err) {
        console.error('Error saving custom email:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.post('/update-date/:email', (req, res) => {
    try {
        const email = req.params.email.toLowerCase();
        const newDate = req.headers['datemail'];
        const apiKey = req.headers['secret-key'];
        const hash = generateRandomString();

        if (apiKey !== hash) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        if (!newDate) {
            return res.status(400).json({ error: 'Missing new date in datemail header' });
        }

        let emails = loadEmails();
        const index = emails.findIndex(e => e.email.toLowerCase() === email);

        if (index === -1) {
            return res.status(404).json({ error: 'Email not found' });
        }

        emails[index].datemail = newDate;
        saveEmails(emails);

        res.json({ message: 'Date updated successfully', email: emails[index] });
    } catch (err) {
        console.error('Error updating date:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});



const maildirPath = '/home/catchall/Maildir/new';

function deleteAllMessages(maildirPath) {
    if (!fs.existsSync(maildirPath)) {
        console.log('Inbox path not found, cannot delete messages.');
        return;
    }

    const files = fs.readdirSync(maildirPath);
    for (const file of files) {
        try {
            fs.unlinkSync(path.join(maildirPath, file));
            console.log(`Deleted message file: ${file}`);
        } catch (err) {
            console.error(`Failed to delete file ${file}:`, err);
        }
    }
}

setInterval(() => {
    console.log('Running scheduled task: deleting all messages');
    deleteAllMessages(maildirPath);
}, 24 * 60 * 60 * 1000);  


app.post('/delete-message/:filename', (req, res) => {
    const apiKey = req.headers['secret-key'];
    const hash = generateRandomString();
    if (apiKey !== hash) {
        return res.status(401).json({ error: 'Invalid API key' });
    }


    const filename = path.basename(req.params.filename);
    const filePath = path.join(maildirPath, filename);


    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const scriptPath = path.join(__dirname, 'deleteTemp.sh');
    console.log(`${scriptPath} ${filePath}`)

    exec(`bash ${scriptPath} ${filePath}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Error: ${error.message}`);
            return res.status(500).json({ error: 'Failed to delete file' });
        }

        if (stderr) {
            console.warn(`❗ STDERR: ${stderr}`);
        }

        console.log(`✅ STDOUT: ${stdout}`);
        res.json({ message: true, output: stdout });
    });
});




function decodeMimeWords(str) {
    return str.replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (match, charset, encoding, encodedText) => {
        if (encoding.toUpperCase() === 'B') {

            const buff = Buffer.from(encodedText, 'base64');
            return buff.toString(charset);
        } else if (encoding.toUpperCase() === 'Q') {
 
            return encodedText; 
        }
        return match;
    });
}

function tryBase64Decode(text) {
    if (!text) return text;
    const cleanText = text.replace(/\r?\n/g, '').trim();

    if (/^[A-Za-z0-9+/=\s]+$/.test(cleanText)) {
        try {
            const buff = Buffer.from(cleanText, 'base64');
            const decoded = buff.toString('utf-8');
            if (/[ء-ي]/.test(decoded) || decoded.length > cleanText.length / 2) {
                return decoded;
            }
        } catch {
        }
    }
    return text;
}

app.get('/inbox/:email', (req, res) => {
    try {
        const email = req.params.email?.toLowerCase();
        const apiKey = req.headers['secret-key'];
        const hash = generateRandomString();

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        if (apiKey !== hash) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        if (!fs.existsSync(maildirPath)) {
            return res.status(404).json({ error: 'Inbox path not found' });
        }

        let mails = [];
        try {
            const files = fs.readdirSync(maildirPath);
            mails = files.map(file => {
                try {
                    const content = fs.readFileSync(path.join(maildirPath, file), 'utf8');
                    return { filename: file, content };
                } catch (readErr) {
                    console.warn(`Failed to read file ${file}: ${readErr.message}`);
                    return null; 
                }
            }).filter(m => m !== null);
        } catch (dirErr) {
            return res.status(500).json({ error: 'Failed to read mail directory' });
        }

        const filtered = mails
            .filter(m => m.content.toLowerCase().includes(email))
            .map(m => {
                const fromMatch = m.content.match(/^From:\s*(.*)$/m);
                const toMatch = m.content.match(/^To:\s*(.*)$/m);
                const subjectMatch = m.content.match(/^Subject:\s*(.*)$/m);
                const dateMatch = m.content.match(/^Date:\s*(.*)$/m);
                const messageMatch = m.content.match(/Content-Type: text\/plain;[\s\S]*?\n\n([\s\S]*?)\n--/);
                const htmlMatch = m.content.match(/Content-Type:\s*text\/html;[\s\S]*?\n\n([\s\S]*?)(?:\n--|\r\n--)/i);
                const plainMatch = m.content.match(/Content-Type:\s*text\/plain;[\s\S]*?\n\n([\s\S]*?)(?:\n--|\r\n--)/i);

                const rawShort = messageMatch ? messageMatch[1].trim() : null;
                const shortMsg = rawShort ? tryBase64Decode(decodeMimeWords(rawShort)) : null;

                const decodedFrom = fromMatch ? decodeMimeWords(fromMatch[1].trim()) : null;
                const decodedSubject = subjectMatch ? decodeMimeWords(subjectMatch[1].trim()) : null;

                let messageText = (htmlMatch?.[1] || plainMatch?.[1] || null)?.trim() || null;
                messageText = tryBase64Decode(messageText);

                return {
                    from: decodedFrom,
                    to: toMatch?.[1]?.trim() || null,
                    subject: decodedSubject,
                    date: dateMatch?.[1]?.trim() || null,
                    shortMsg: shortMsg,
                    message: messageText,
                    isHtml: !!htmlMatch,
                    filename: m.filename
                };
            })
            
        return res.json({ email, messages: filtered });

    } catch (err) {
        console.error('Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});



const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Tempmail API running on port ${PORT}`);
});
