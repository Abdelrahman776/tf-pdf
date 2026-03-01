import { LayoutIcon, SearchIcon, Minimize, PencilIcon } from "lucide-react";

export default function Features() {
  const features = [
    {
      title: "Smart Conversion",
      description: "Keeps the integrity of your original layout.",
      icon: <LayoutIcon className="w-10 h-10 text-tfblack dark:text-tfwhite" />,
    },
    {
      title: "Searchable & Editable",
      description: "Your converted files can be searched, copied, and edited.",
      icon: <SearchIcon className="w-10 h-10 text-tfblack dark:text-tfwhite" />,
    },
    {
      title: "Compression",
      description:
        "Significant size reduction from image-based to truly digital PDFs (e.g., 20MB → 900KB).",
      icon: <Minimize className="w-10 h-10 text-tfblack dark:text-tfwhite" />,
    },
    {
      title: "Handwritten Notes",
      description:
        "Supports the conversion of handwritten notes into digital text.",
      icon: <PencilIcon className="w-10 h-10 text-tfblack dark:text-tfwhite" />,
    },
  ];

  return (
    <section className="py-16 bg-tfwhite dark:bg-tfblack" id="features">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-tfblack dark:text-tfwhite">
            Key Features
          </h2>
          <p className="mt-4 text-lg text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">
            TrueForm PDF offers powerful capabilities to transform your
            documents
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex flex-col min-h-62.5 bg-tfwhite dark:bg-tfblack border border-tfblue/50 p-6 rounded-lg shadow-lg shadow-tfblue/20 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-tforange/20 hover:border-tforange"
            >
              <div className="flex justify-center mb-6">{feature.icon}</div>
              <div className="grow">
                <h3 className="text-xl font-bold text-center text-tfblack dark:text-tfwhite mb-4">
                  {feature.title}
                </h3>
                <p className="text-gray-700 dark:text-gray-300 text-center">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
