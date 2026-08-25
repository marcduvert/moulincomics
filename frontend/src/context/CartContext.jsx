import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mc_cart") || "[]"); } catch { return []; }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => { localStorage.setItem("mc_cart", JSON.stringify(items)); }, [items]);

  const add = (product, qty = 1) => {
    setItems((prev) => {
      const found = prev.find((i) => i.product_id === product.id);
      if (found) {
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: Math.min(i.quantity + qty, product.stock) } : i);
      }
      return [...prev, {
        product_id: product.id, title: product.title, price: product.price,
        cover_image: product.cover_image, quantity: qty, stock: product.stock,
      }];
    });
    setOpen(true);
  };
  const remove = (id) => setItems((prev) => prev.filter((i) => i.product_id !== id));
  const setQty = (id, qty) =>
    setItems((prev) => prev.map((i) => (i.product_id === id ? { ...i, quantity: qty } : i)));
  const clear = () => setItems([]);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, add, remove, setQty, clear, count, total, open, setOpen }}>
      {children}
    </CartContext.Provider>
  );
};
