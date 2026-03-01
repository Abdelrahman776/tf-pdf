import { Check } from "lucide-react";

export default function Pricing() {
  const plans = [
    {
      name: "Registered",
      price: "$0",
      features: ["Registration is free", "5 files every 24 hours"],
      cta: "Register / Sign in",
      highlighted: false,
    },
    {
      name: "Pay-as-you-go",
      price: "$1",
      features: ["One-time purchase", "No subscription"],
      cta: "Buy 30 credits",
      highlighted: true,
    },
  ];

  const handleCTAClick = (index: number) => {
    if (index === 0) {
      console.log("logging in");
    } else if (index === 1) {
      console.log("paying 1 dollar");
    }
  };

  return (
    <section className="bg-tfwhite dark:bg-tfblack py-14 border-b border-gray-200 dark:border-gray-900" id="pricing">
      <div className="flex items-center justify-center flex-col gap-2 text-center">
        <h2 className="text-tfblack dark:text-white font-bold text-4xl">
          Pricing
        </h2>
        <p className="text-gray-700 dark:text-gray-300 text-lg">
          Simple tiers that scale with your needs.
        </p>
      </div>
      <div className="flex flex-col md:flex-row justify-center items-center gap-8 mt-12 mx-4">
        {plans.map((plan, index) => {
          return (
            <div
              key={index}
              className={`border rounded p-6 flex flex-col text-center w-[85%] md:w-90 ${
                plan.highlighted
                  ? "border-tforange shadow-lg shadow-tforange/40"
                  : "border-tfblue shadow-lg shadow-tfblue/20"
              }`}
            >
              <h3 className="dark:text-tfwhite text-tfblack font-bold text-2xl mb-4">
                {plan.name}
              </h3>

              <p className="dark:text-tfwhite text-tfblack font-extrabold text-5xl mb-8">
                {plan.price}
              </p>

              <div className="grow">
                <ul className="space-y-2 mb-6 text-left">
                  {plan.features.map((feature, i) => {
                    return (
                      <li className="flex items-center gap-2" key={i}>
                        <Check className="h-5 w-5 text-emerald-500" />
                        <span className="dark:text-tfwhite text-tfblack">
                          {feature}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <button
                onClick={() => handleCTAClick(index)}
                className={`w-full py-3 rounded text-tfwhite font-semibold transition-colors ${
                  index === 0
                    ? "bg-tfblue hover:bg-blue-950"
                    : "bg-tforange hover:bg-orange-800"
                }`}
              >
                {plan.cta}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
