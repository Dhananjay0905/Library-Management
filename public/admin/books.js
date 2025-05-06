document.addEventListener('DOMContentLoaded', () => {
    fetchBooks();

    // Add search listener
    const searchInput = document.getElementById('search-input');
    const searchFilter = document.getElementById('search-filter');
    searchInput.addEventListener('input', () => filterBooks(searchInput.value, searchFilter.value));
    searchFilter.addEventListener('change', () => filterBooks(searchInput.value, searchFilter.value));
});

let allBooks = [];

function fetchBooks() {
    fetch('/api/admin/books')
        .then(res => res.json())
        .then(data => {
            allBooks = data;
            renderBooks(data);
        });
}

function renderBooks(data) {
    const tbody = document.getElementById('books-body');
    tbody.innerHTML = '';

    data.forEach(book => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td contenteditable="false">${book.book_id}</td>
            <td contenteditable="false">${book.title}</td>
            <td contenteditable="false">${book.author}</td>
            <td contenteditable="false">${book.genre}</td>
            <td contenteditable="false">${book.year_of_publication}</td>
            <td contenteditable="false">${book.issued}</td>
            <td>
                <button onclick="enableEdit(this)">✏️</button>
                <button style="display:none;" onclick="saveEdit(this, '${book._id}', '${book._rev}')">✅</button>
                <button onclick="deleteBook('${book._id}', '${book._rev}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterBooks(query, filterKey) {
    const lowerQuery = query.toLowerCase();
    const filtered = allBooks.filter(book => {
        const field = book[filterKey]?.toString().toLowerCase();
        return field.startsWith(lowerQuery);
    });
    renderBooks(filtered);
}

function enableEdit(btn) {
    const row = btn.parentElement.parentElement;
    [...row.children].slice(0, 6).forEach(td => td.contentEditable = true);
    btn.style.display = 'none';
    btn.nextElementSibling.style.display = 'inline-block';
}

function saveEdit(btn, id, rev) {
    const row = btn.parentElement.parentElement;
    const cells = row.querySelectorAll('td');
    const updatedBook = {
        _id: id,
        _rev: rev,
        book_id: cells[0].innerText,
        title: cells[1].innerText,
        author: cells[2].innerText,
        genre: cells[3].innerText,
        year_of_publication: parseInt(cells[4].innerText),
        issued: cells[5].innerText
    };

    fetch('/api/admin/books/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBook)
    }).then(() => fetchBooks());
}

function deleteBook(id, rev) {
    const confirmed = confirm("🗑️ Are you sure you want to delete this book?");
    if (!confirmed) return;

    fetch(`/api/admin/books/${id}?rev=${rev}`, { method: 'DELETE' })
        .then(() => fetchBooks());
}


document.getElementById('add-book-form').addEventListener('submit', async e => {
    e.preventDefault();

    const book = {
        book_id: document.getElementById('book_id').value.trim(),
        title: document.getElementById('title').value.trim(),
        author: document.getElementById('author').value.trim(),
        genre: document.getElementById('genre').value.trim(),
        year_of_publication: parseInt(document.getElementById('year').value),
        issued: document.getElementById('issued').value
    };

    try {
        const res = await fetch('/api/admin/books');
        const books = await res.json();

        const isDuplicate = books.some(b =>
            b.book_id === book.book_id ||
            b.title.toLowerCase() === book.title.toLowerCase() ||
            b.author.toLowerCase() === book.author.toLowerCase() ||
            b.genre.toLowerCase() === book.genre.toLowerCase()
        );

        if (isDuplicate) {
            alert("🚫 A book with the same ID, title, author, or genre already exists.");
            return;
        }

        await fetch('/api/admin/books', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(book)
        });

        fetchBooks();
        e.target.reset();
    } catch (error) {
        console.error("Error adding book:", error);
        alert("❌ Failed to add book. Please try again.");
    }
});


app.get('/appid/callback', passport.authenticate(WebAppStrategy.STRATEGY_NAME, { failureRedirect: '/' }), async (req, res) => {
    try {
        const email = req.user.email;
        const name = req.user.name || "Unknown";
        console.log("User info from App ID:", req.user);
        // Check if user already exists in the database
        const result = await db.find({ selector: { email } });

        if (result.docs.length == 0) {
            // Insert new user
            const newUser = {
                first_name: name,
                last_name: '',
                email: email,
                current_book_issued: '',
                issue_date: '',
                returned: ''
            };

            console.log("Attempting to insert user:", newUser);
            const response = await db.insert(newUser);
            console.log("Insert response:", response);

            console.log('New user inserted:', newUser);
        } else {
            console.log('User already exists:', email);
        }

        res.redirect('/dashboard');
    } catch (err) {
        console.error('Error handling App ID callback:', err);
        res.status(500).send('Internal server error during App ID login.');
    }
});
