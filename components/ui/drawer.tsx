"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

/**
 * iOS Safari nao recalcula "dvh"/"vh" de forma confiavel quando o teclado
 * virtual abre dentro de um elemento "position: fixed". Isso fazia o Drawer
 * colapsar (o rodape ficava espremido e a pagina por tras aparecia atras
 * dele). Este hook usa a Visual Viewport API (quando disponivel) para medir
 * a altura real visivel da tela e atualiza sozinho quando o teclado
 * abre/fecha ou a pagina rola.
 */
function useVisualViewportHeight() {
  const [height, setHeight] = React.useState<number | null>(null)

  React.useEffect(() => {
    const viewport = window.visualViewport

    const update = () => {
      setHeight(viewport ? viewport.height : window.innerHeight)
    }

    update()

    if (viewport) {
      viewport.addEventListener("resize", update)
      viewport.addEventListener("scroll", update)
    } else {
      window.addEventListener("resize", update)
    }

    return () => {
      if (viewport) {
        viewport.removeEventListener("resize", update)
        viewport.removeEventListener("scroll", update)
      } else {
        window.removeEventListener("resize", update)
      }
    }
  }, [])

  return height
}

/** Trava o scroll do body enquanto o elemento estiver montado (drawer aberto). */
function useLockBodyScroll(locked: boolean) {
  React.useEffect(() => {
    if (!locked) return

    const { style } = document.body
    const previousOverflow = style.overflow
    const previousPosition = style.position
    const previousWidth = style.width

    style.overflow = "hidden"
    style.position = "fixed"
    style.width = "100%"

    return () => {
      style.overflow = previousOverflow
      style.position = previousPosition
      style.width = previousWidth
    }
  }, [locked])
}

function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger(props: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal(props: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose(props: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({ className, style, ...props }: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  const viewportHeight = useVisualViewportHeight()

  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("fixed inset-x-0 top-0 z-50 bg-black/50", className)}
      style={{
        // Altura real da tela visivel (ignora o espaco tomado pelo teclado no iOS).
        height: viewportHeight ? `${viewportHeight}px` : "100dvh",
        ...style,
      }}
      {...props}
    />
  )
}

function DrawerContent({ className, style, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const viewportHeight = useVisualViewportHeight()
  useLockBodyScroll(true)

  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background",
          className
        )}
        style={{
          // Sobrescreve qualquer h-[...dvh...] vindo de fora: a altura real
          // medida pela Visual Viewport API sempre vence, inclusive com o
          // teclado do iOS aberto.
          height: viewportHeight ? `${Math.max(viewportHeight - 12, 320)}px` : undefined,
          maxHeight: viewportHeight ? `${viewportHeight}px` : "96vh",
          ...style,
        }}
        {...props}
      >
        <div data-slot="drawer-handle" className="absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-[#9fb66a]" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-header" className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)} {...props} />
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("font-semibold", className)} {...props} />
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return <DrawerPrimitive.Description data-slot="drawer-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
}