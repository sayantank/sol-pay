import React from "react";
import {
  UserCircleIcon,
  CogIcon,
  XIcon,
  CreditCardIcon,
} from "@heroicons/react/outline";

const FloatingNav: React.FC<{}> = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <div className="fixed bottom-0 right-4 mb-6 flex items-center space-x-2">
      <div
        className={`${
          isOpen ? "opacity-100" : "opacity-0"
        } transition-opacity bg-slate-700 px-4 py-2 rounded-full flex space-between items-center space-x-4`}
      >
        <UserCircleIcon className="h-7 w-7 text-slate-500" />
        <CreditCardIcon className="h-7 w-7 text-slate-500" />
      </div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`bg-slate-700 p-2 rounded-full`}
      >
        {isOpen ? (
          <XIcon className="w-7 h-7 text-slate-500" />
        ) : (
          <CogIcon className="w-7 h-7 text-slate-500" />
        )}
      </button>
    </div>
  );
};

export default FloatingNav;
