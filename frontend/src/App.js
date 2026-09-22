import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { CartProvider } from "./context/CartContext";
import { LanguageProvider } from "./context/LanguageContext";
import { ContentProvider, useContent } from "./context/ContentContext";
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
import { ContentPage } from "./pages/ContentPage";
import SiteContent from "./pages/SiteContent";
import Contact from "./pages/Contact";
import { CookieConsent } from "./components/CookieConsent";

const Storefront = ({ children }) => {
  useLenis();
  const { content } = useContent();
  const vac = content?.vacation;
  return (
    <>
      <div className="grain" />
      <Header />
      {vac?.enabled && (
        <div data-testid="vacation-banner"
          className="bg-comicred text-paper font-mono text-xs sm:text-sm uppercase tracking-widest text-center px-4 py-3 border-b-2 border-ink">
          {vac.message}
        </div>
      )}
      {children}
      <Footer />
      <CartDrawer />
      <CookieConsent />
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
        <Route path="/admin/content" element={<SiteContent />} />
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
        <Route path="/contact" element={<Contact />} />
        <Route path="/mentions-legales" element={<ContentPage pageKey="mentions-legales" />} />
        <Route path="/cgv" element={<ContentPage pageKey="cgv" />} />
        <Route path="/politique-livraison" element={<ContentPage pageKey="politique-livraison" />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/payment/cancel" element={<PaymentCancel />} />
      </Routes>
    </Storefront>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <ContentProvider>
        <CartProvider>
          <BrowserRouter>
            <Toaster position="top-center" toastOptions={{ style: { borderRadius: 0, border: "2px solid #0A0A0A", fontFamily: "IBM Plex Mono" } }} />
            <Layout />
          </BrowserRouter>
        </CartProvider>
      </ContentProvider>
    </LanguageProvider>
  );
}
