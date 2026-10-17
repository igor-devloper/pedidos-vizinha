"use client";

import { useCallback, useState, type ReactNode } from "react";

/**
 * Foto opcional: o `fallback` fica sempre por trás e a foto só aparece depois de carregar de verdade.
 * Assim, é só colocar o arquivo na pasta (ex.: /public/fotos/coxinha.jpg) e a foto aparece sozinha;
 * se o arquivo não existe, o `fallback` continua visível e nunca aparece ícone de imagem quebrada.
 */
export function FotoOpcional({
  src,
  alt,
  fallback,
  className = "",
}: {
  src: string;
  /** Descrição para leitores de tela. Use "" quando o nome já está escrito ao lado. */
  alt: string;
  fallback: ReactNode;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  // A imagem pode terminar de carregar antes de o React ligar o onLoad (HTML rápido): confere ao montar.
  const checkOnMount = useCallback((image: HTMLImageElement | null) => {
    if (image && image.complete && image.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <span role={alt ? "img" : undefined} aria-label={alt || undefined} className="relative block h-full w-full">
      <span className="absolute inset-0 flex items-center justify-center">{fallback}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={checkOnMount}
        src={src}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
        className={`absolute inset-0 h-full w-full transition-opacity ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
      />
    </span>
  );
}
