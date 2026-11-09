import clsx from "clsx";

export const Spinner = ({ className }: { className?: string }) => (
  <span className={clsx("spin inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent", className)} />
);
