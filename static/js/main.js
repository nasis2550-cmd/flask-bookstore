// Main JavaScript file for Flask Bookstore

// Shopping cart functionality
let cart = [];

/**
 * Add a book to the shopping cart
 * @param {number} bookId - The ID of the book
 * @param {string} bookTitle - The title of the book
 */
function addToCart(bookId, bookTitle) {
    // Check if book is already in cart
    const existingItem = cart.find(item => item.id === bookId);
    
    if (existingItem) {
        existingItem.quantity += 1;
        showNotification(`Added another copy of "${bookTitle}" to cart!`, 'success');
    } else {
        cart.push({
            id: bookId,
            title: bookTitle,
            quantity: 1
        });
        showNotification(`"${bookTitle}" added to cart!`, 'success');
    }
    
    updateCartDisplay();
    console.log('Current cart:', cart);
}

/**
 * Update the cart display
 */
function updateCartDisplay() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    console.log(`Total items in cart: ${totalItems}`);
    // In a full implementation, this would update a cart icon or counter in the UI
}

/**
 * Show a notification to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of notification (success, error, info)
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '15px 25px',
        backgroundColor: type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8',
        color: 'white',
        borderRadius: '5px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)',
        zIndex: '1000',
        animation: 'slideIn 0.3s ease-out',
        fontWeight: 'bold'
    });
    
    // Add to document
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

/**
 * Initialize the application
 */
function init() {
    console.log('Flask Bookstore initialized');
    
    // Add animation styles for notifications
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Add event listeners for add to cart buttons
    const addToCartButtons = document.querySelectorAll('.btn-add-cart');
    addToCartButtons.forEach(button => {
        button.addEventListener('click', function() {
            const bookId = parseInt(this.dataset.bookId);
            const bookTitle = this.dataset.bookTitle;
            addToCart(bookId, bookTitle);
        });
    });
    
    // Add event listeners for book cards hover
    const bookCards = document.querySelectorAll('.book-card');
    bookCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.cursor = 'pointer';
        });
    });
}

// Run initialization when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export functions for potential use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        addToCart,
        updateCartDisplay,
        showNotification
    };
}
