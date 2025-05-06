document.addEventListener('DOMContentLoaded', () => {
    fetchBooks();
  
    const searchInput = document.getElementById('search-input');
    const searchFilter = document.getElementById('search-filter');
  
    searchInput.addEventListener('input', () =>
      filterBooks(searchInput.value, searchFilter.value)
    );
  
    searchFilter.addEventListener('change', () =>
      filterBooks(searchInput.value, searchFilter.value)
    );
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
        <td>${book.book_id}</td>
        <td>${book.title}</td>
        <td>${book.author}</td>
        <td>${book.genre}</td>
        <td>${book.year_of_publication}</td>
        <td>${book.issued}</td>
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
  