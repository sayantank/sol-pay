import React, { FC } from "react";

interface IDropdownItem {
  label: string;
  value: any;
  icon?: string;
}

interface IDropdown {
  onChange: (...event: any[]) => void;
  selected: any;
  items: IDropdownItem[];
  id: string;
}

const Dropdown: FC<IDropdown> = ({ items, id }) => {
  const [name, setName] = React.useState("Ethereum");
  const [isOpen, setIsOpen] = React.useState(false);
  const [item, setItem] = React.useState(items[0]);

  const handleClick = (item: IDropdownItem) => {
    setItem(item);
    setIsOpen(false);
  };

  return (
    <div className="w-full relative">
      <label
        htmlFor={`dropdown-${id}`}
        className="w-full p-4 rounded-full  bg-slate-700 flex items-center space-x-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="h-8 w-8 rounded-full bg-slate-300" />
        <p className="text-slate-300">{item.label}</p>
      </label>
      <div
        className={`dropdown-${id} absolute w-full top-full mt-2 ${
          isOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        } transition-all bg-slate-700 rounded-xl z-20`}
      >
        {items.map((item, i) => (
          <div
            key={`${id}-opt-${i}`}
            onClick={() => handleClick(item)}
            className="w-full p-4 border-b border-slate-800 flex items-center space-x-2"
          >
            <div className="h-8 w-8 rounded-full bg-slate-300" />
            <div className="text-slate-300">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dropdown;
