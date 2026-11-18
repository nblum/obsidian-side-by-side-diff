import { View } from "obsidian";
import type { Menu } from "obsidian";

type TabMenuView = View & { onTabMenu: (menu: Menu) => void };

/** Extends native tab menus, including hidden tabs that do not emit file-menu. */
export function extendTabMenus(addItems: (menu: Menu, view: View) => void): (() => void) | null {
  // Obsidian's tab hook is not public API; guard it and retain the file-menu fallback.
  const viewConstructor = View as typeof View | undefined;
  const prototype = viewConstructor?.prototype as Partial<TabMenuView> | undefined;
  const original = prototype?.onTabMenu;
  if (!prototype || typeof original !== "function") {
    return null;
  }
  const nativeOnTabMenu = original;
  let enabled = true;
  /** Preserves Obsidian's menu before adding the comparison entry. */
  function onTabMenu(this: View, menu: Menu): void {
    nativeOnTabMenu.call(this, menu);
    if (enabled) {
      addItems(menu, this);
    }
  }
  prototype.onTabMenu = onTabMenu;
  return () => {
    enabled = false;
    // Leave later wrappers intact; a retained copy of ours becomes inert on unload.
    if (prototype.onTabMenu === onTabMenu) {
      prototype.onTabMenu = original;
    }
  };
}
