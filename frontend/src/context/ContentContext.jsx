import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";

const ContentContext = createContext(null);
export const useContent = () => useContext(ContentContext);

export const ContentProvider = ({ children }) => {
  const [content, setContent] = useState(null);
  const refresh = useCallback(() => {
    api.get("/content").then((r) => setContent(r.data)).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return (
    <ContentContext.Provider value={{ content, refresh }}>
      {children}
    </ContentContext.Provider>
  );
};
