import { createContext, useContext, useEffect, ReactNode } from 'react'

type SetBottomBar = (node: ReactNode | null) => void

export const BottomBarContext = createContext<SetBottomBar | undefined>(undefined)

// Lets a page publish content into the app shell's bottom action bar (a real
// flex sibling of the scrollable content, not a `position: fixed` overlay -
// see App.tsx). Pass a value memoized with useMemo/useCallback deps so this
// doesn't re-publish on every unrelated re-render.
export function useBottomBar(node: ReactNode | null) {
  const setBottomBar = useContext(BottomBarContext)
  useEffect(() => {
    setBottomBar?.(node)
    return () => setBottomBar?.(null)
  }, [node, setBottomBar])
}
