import { useTheme } from "@/contexts/ThemeContext";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  // Usa o mesmo provider do app (contexts/ThemeContext). Antes vinha de
  // next-themes, que não está montado — o Toaster caía sempre em "system".
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--success-soft)",
          "--success-text": "var(--success)",
          "--success-border": "var(--success)",
          "--error-bg": "var(--danger-soft)",
          "--error-text": "var(--danger)",
          "--error-border": "var(--danger)",
          "--warning-bg": "var(--warning-soft)",
          "--warning-text": "var(--warning)",
          "--warning-border": "var(--warning)",
          "--info-bg": "var(--info-soft)",
          "--info-text": "var(--info)",
          "--info-border": "var(--info)",
          zIndex: "var(--z-toast)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
