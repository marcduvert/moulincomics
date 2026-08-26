import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { CartProvider } from "./context/CartContext";
import { LanguageProvider } from "./context/LanguageContext";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { CartDrawer } from "./components/CartDrawer";
import useLenis from "./hooks/useLenis";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import ProductDetail from "./pages/ProductDetail";
import Conventions from "./pages/Conventions";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import AdminLogin from "./pages/AdminLogin";
import Admin from "./pages/Admin";
import ImportIA from "./pages/ImportIA";

const Storefront = ({ children }) => {
  useLenis();
  return (
    <>
      <div className="grain" />
      <Header />
      {children}
      <Footer />
      <CartDrawer />
    </>
  );
};

const Layout = () => {
  const loc = useLocation();
  const isAdmin = loc.pathname.startsWith("/admin");
  if (isAdmin) {
    return (
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/import" element={<ImportIA />} />
      </Routes>
    );
  }
  return (
    <Storefront>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/conventions" element={<Conventions />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/payment/cancel" element={<PaymentCancel />} />
      </Routes>
    </Storefront>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <CartProvider>
        <BrowserRouter>
          <Toaster position="top-center" toastOptions={{ style: { borderRadius: 0, border: "2px solid #0A0A0A", fontFamily: "IBM Plex Mono" } }} />
          <Layout />
        </BrowserRouter>
      </CartProvider>
    </LanguageProvider>
  );
}
