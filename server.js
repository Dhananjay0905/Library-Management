const express = require('express');
const session = require('express-session');
const { WebAppStrategy } = require('ibmcloud-appid');
const passport = require('passport');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const Cloudant = require('@cloudant/cloudant'); // Cloudant SDK
const cors = require('cors');


const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
// IBM Cloudant Configuration
const cloudant = Cloudant({ url: 'https://apikey-v2-unmowzyasdo2clk1uevq60iyqegjg211n0tosjt104k:521f2d3d2375f205fb92d9c688d01321@fcf4f76d-5dd6-4ff7-b9e2-da2d2e93fdaa-bluemix.cloudantnosqldb.appdomain.cloud', plugins: { iamauth: { iamApiKey: 'rtHjOahAP7I_aBgoMQbI69U4dz9Vra7Ul880o-ZG6gQU' } } });
const db = cloudant.db.use('logreg'); // logreg DB
const adminDB = cloudant.db.use('admins'); // Admins DB
const booksDb = cloudant.db.use('books'); // books DB
// Configure session middleware
app.use(session({
    secret: '123456',
    resave: false,
    saveUninitialized: false,
    cookie: {
        sameSite: 'lax', // prevents login redirect issues
        secure: false    // set to true if using HTTPS
    }
}));


app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configure passport with IBM App ID
passport.use(new WebAppStrategy({
    tenantId: "69675b94-a02e-4e6b-910f-8c4051b2b21d",
    clientId: "3b55881a-dafe-4e83-b4bb-84f0d34d613d",
    secret: "NjQyZGNhODEtYjM3ZC00NDVlLThkMzMtMjFiZmY1NGZkOTVh",
    oauthServerUrl: "https://au-syd.appid.cloud.ibm.com/oauth/v4/69675b94-a02e-4e6b-910f-8c4051b2b21d",
    redirectUri: "http://localhost:3000/appid/callback"
}));

// Required serialization
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Static files
app.use(express.static('./public'));

// Routes
app.get('/', (req, res) => {
    if (req.user || req.session.user) {
        return res.redirect('/dashboard');
    }
    res.sendFile(__dirname + '/public/login.html');
});


app.get('/register', (req, res) => {
    res.sendFile(__dirname + '/public/register.html');
});

// Redirect to App ID login
app.get('/appid/login', passport.authenticate(WebAppStrategy.STRATEGY_NAME, {
    successRedirect: '/',
    forceLogin: true
}));


app.get('/appid/callback',
    passport.authenticate(WebAppStrategy.STRATEGY_NAME, { keepSessionInfo: true }),
    (req, res) => {
        res.redirect('/dashboard');
    }
);




// Protected dashboard
app.get('/dashboard', (req, res) => {
    if (!req.user && !req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(__dirname + '/public/dashboard.html');
});




// Register route to handle the registration form submission
app.post('/register', (req, res) => {
    const { first_name, last_name, age, email, password, re_password } = req.body;

    if (password !== re_password) {
        return res.send(`<script>alert("Passwords do not match"); window.location.href='/register';</script>`);
    }

    // Check if email already exists
    db.find({ selector: { email: email } }, (err, result) => {
        if (err) {
            console.error('Error querying Cloudant:', err);
            return res.status(500).send('Internal server error');
        }

        if (result.docs.length > 0) {
            return res.send(`<script>alert("Email already registered. Please use a different one."); window.location.href='/register';</script>`);
        }

        // Hash and insert new user
        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) {
                console.error('Error hashing password:', err);
                return res.status(500).send('Error hashing password');
            }

            const newUser = {
                first_name,
                last_name,
                age,
                email,
                password: hashedPassword,
                current_book_issued: "",   // New empty field
                issue_date: "",            // New empty field
                return_date: ""               // New empty field
            };

            db.insert(newUser, (err, body) => {
                if (err) {
                    console.error('Error inserting user:', err);
                    return res.status(500).send('Error saving user to Cloudant');
                }

                res.redirect('/');
            });
        });
    });
});


app.post('/login-user', (req, res) => {
    const { email, password } = req.body;

    // Find user by email
    db.find({ selector: { email: email } }, (err, result) => {
        if (err || result.docs.length === 0) {
            return res.send(`<script>alert("Invalid email or password"); window.location.href='/';</script>`);
        }

        const user = result.docs[0];

        // Compare hashed password
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err || !isMatch) {
                return res.send(`<script>alert("Invalid email or password"); window.location.href='/';</script>`);
            }

            // Password matched – login successful
            // Optionally, you can use session here to persist login
            req.session.user = {
                name: user.first_name,
                email: user.email
            };

            res.redirect('/dashboard');
        });
    });
});



app.get('/logout-user', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).send("Error during logout");
        }
        res.redirect('/'); // Redirect to login page after logout
    });
});


app.get('/admin-login', (req, res) => {
    res.sendFile(__dirname + '/public/admin/admin-login.html');
});


app.post('/admin-login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await adminDB.find({ selector: { username } });

        if (result.docs.length === 0 || result.docs[0].password !== password) {
            return res.status(401).send('Invalid username or password');
        }

        req.session.isAdminLoggedIn = true;
        res.redirect('/admin-dashboard');
    } catch (error) {
        console.error("Admin login error:", error);
        res.status(500).send('Server error');
    }
});


app.get('/admin-dashboard', (req, res) => {
    if (!req.session.isAdminLoggedIn) {
        return res.redirect('/admin/admin-login.html'); // or /admin-login
    }
    res.sendFile(__dirname + '/public/admin/admin-dashboard.html');
});

app.get('/admin-logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send("Could not log out.");
        }
        res.redirect('/');
    });
});


app.get('/admin/books', (req, res) => {
    if (!req.session.isAdminLoggedIn) {
        return res.redirect('/admin/admin-login.html'); // Redirect to login if not logged in
    }
    res.sendFile(__dirname + '/public/admin/books.html'); // Serve the books management page
});


// Admin API for books
app.get('/api/admin/books', async (req, res) => {
    const response = await booksDb.list({ include_docs: true });
    const books = response.rows.map(row => row.doc);
    res.json(books);
});

app.post('/api/admin/books', async (req, res) => {
    const book = req.body;
    const result = await booksDb.insert(book);
    res.json(result);
});

app.put('/api/admin/books/:id', async (req, res) => {
    const updatedBook = req.body;
    const result = await booksDb.insert(updatedBook);
    res.json(result);
});

app.delete('/api/admin/books/:id', async (req, res) => {
    const id = req.params.id;
    const rev = req.query.rev;
    const result = await booksDb.destroy(id, rev);
    res.json(result);
});




// Fetch all users
app.get('/admin/issues', async (req, res) => {
    if (!req.session.isAdminLoggedIn) {
        return res.redirect('/admin/admin-login.html'); // Redirect to login if not logged in
    }
    try {
        const userDocs = await db.list({ include_docs: true });
        const users = userDocs.rows.map(row => row.doc);
        res.sendFile(__dirname + '/public/admin/admin-issues.html');
    } catch (err) {
        res.status(500).send("Error fetching users");
    }
});

// API to get users for AJAX
app.get('/api/admin/users', async (req, res) => {
    try {
        const userDocs = await db.list({ include_docs: true });
        const users = userDocs.rows.map(row => row.doc);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// API to return a book
app.post('/api/admin/return-book', async (req, res) => {
    const { userId } = req.body;
    try {
        const user = await db.get(userId);
        // Also update book to mark it as not issued
        if (user.current_book_issued) {
            const book = (await booksDb.find({ selector: { book_id: user.current_book_issued } })).docs[0];
            if (book) {
                book.issued = 'false';
                await booksDb.insert(book);
            }
        }
        user.current_book_issued = '';
        user.issue_date = '';
        user.returned = 'true';
        await db.insert(user);



        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to return book' });
    }
});

// API to issue a book
app.post('/api/admin/issue-book', async (req, res) => {
    const { userId, bookId, issueDate } = req.body;

    try {
        const user = await db.get(userId);
        const books = await booksDb.find({ selector: { book_id: bookId } });

        if (books.docs.length === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const book = books.docs[0];

        if (book.issued === "true") {
            return res.status(400).json({ error: 'Book is already issued' });
        }

        // Update user record
        user.current_book_issued = bookId;
        user.issue_date = issueDate;
        user.returned = "";

        // Update book record
        book.issued = "true";

        await db.insert(user);
        await booksDb.insert(book);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});



app.get('/my-account', (req, res) => {
    if (!req.user && !req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(__dirname + '/public/my-account.html');
});



// Route to handle updating personal details
app.post('/update-details', async (req, res) => {
    const { first_name, last_name, age } = req.body;
    const userEmail = req.session.user?.email;

    if (!userEmail) {
        return res.status(401).send("Unauthorized: No user session found.");
    }

    try {
        const result = await db.find({ selector: { email: userEmail } });

        if (result.docs.length === 0) {
            return res.status(404).send("User not found.");
        }

        const user = result.docs[0];
        user.first_name = first_name;
        user.last_name = last_name;
        user.age = age;

        await db.insert(user);
        res.send("<script>alert('Details updated successfully.'); window.location.href='/dashboard';</script>");
    } catch (error) {
        console.error("Error updating user details:", error);
        res.status(500).send("Error updating details.");
    }
});


// Route to handle updating password
app.post('/update-password', async (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;
    const userEmail = req.session.user?.email;

    if (!userEmail) {
        return res.status(401).send("Unauthorized: No user session found.");
    }

    // Password strength validation
    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}$/;
    if (!passwordRegex.test(new_password)) {
        return res.send("<script>alert('Password must be at least 8 characters long and include at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.'); window.location.href='/my-account';</script>");
    }

    if (new_password !== confirm_password) {
        return res.send("<script>alert('Passwords do not match'); window.location.href='/my-account';</script>");
    }

    try {
        const result = await db.find({ selector: { email: userEmail } });

        if (result.docs.length === 0) {
            return res.status(404).send("User not found.");
        }

        const user = result.docs[0];
        const isMatch = await bcrypt.compare(current_password, user.password);

        if (!isMatch) {
            return res.send("<script>alert('Incorrect current password'); window.location.href='/my-account';</script>");
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        user.password = hashedPassword;

        await db.insert(user);
        res.send("<script>alert('Password updated successfully.'); window.location.href='/dashboard';</script>");
    } catch (error) {
        console.error("Error updating password:", error);
        res.status(500).send("Error updating password.");
    }
});





// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

