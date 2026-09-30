import React from 'react';
import { Sliders, Grid, Sun, Moon } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { useTheme } from '../../hooks/useTheme';
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer, NavbarLabel } from '../../catalyst-ui-kit/typescript/navbar';

export const Header: React.FC = () => {
  const { currentTab, setCurrentTab } = useEditor();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/80 px-3 backdrop-blur-md sm:px-6">
      <Navbar className="mx-auto max-w-[1600px] py-2.5">
        <div className="flex items-center gap-3 max-sm:mr-auto">
          <img
            src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'}
            alt="" className="size-8 rounded-lg object-contain"
          />
          <h1 className="text-base font-semibold tracking-tight text-zinc-950 dark:text-white">Image Resize</h1>
        </div>

        <NavbarSpacer />

        <NavbarSection>
          <NavbarItem current={currentTab === 'editor'} onClick={() => setCurrentTab('editor')} aria-label="Workspace">
            <Sliders data-slot="icon" />
            <NavbarLabel className="max-sm:hidden">Workspace</NavbarLabel>
          </NavbarItem>
          <NavbarItem current={currentTab === 'sandbox'} onClick={() => setCurrentTab('sandbox')} aria-label="Simulation">
            <Grid data-slot="icon" />
            <NavbarLabel className="max-sm:hidden">Simulation</NavbarLabel>
          </NavbarItem>
          <NavbarItem
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun data-slot="icon" /> : <Moon data-slot="icon" />}
          </NavbarItem>
        </NavbarSection>
      </Navbar>
    </header>
  );
};
