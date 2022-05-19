import { toNumber } from "fuels";
import { useMutation, useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import classNames from "classnames";
import toast from "react-hot-toast";

import assets from "src/lib/CoinsMetadata";
import { Button } from "src/components/Button";
import { Coin } from "src/types";
import { CoinInput, useCoinInput } from "src/components/CoinInput";
import { DECIMAL_UNITS, ONE_ASSET } from "src/config";
import { formatUnits } from "ethers/lib/utils";
import { Pages } from "src/types/pages";
import { RiCheckFill } from "react-icons/ri";
import { Spinner } from "src/components/Spinner";
import { useContract } from "src/context/AppContext";

const style = {
  wrapper: `w-screen flex flex-1 items-center justify-center pb-14`,
  content: `bg-gray-800 w-[30rem] rounded-2xl p-4 m-2`,
  formHeader: `px-2 flex items-center justify-between font-semibold text-xl`,
  info: `font-mono my-4 px-4 py-3 text-sm text-slate-400 decoration-1 border border-dashed border-white/10 rounded-lg`,
};

function PoolLoader({
  loading,
  step,
  steps,
}: {
  coinFrom: Coin;
  coinTo: Coin;
  loading: boolean;
  step: number;
  steps: string[];
}) {
  return (
    <ul className="w-full rounded-lg border border-gray-600 text-gray-900">
      {steps.map((stepText, index) => (
        <li
          key={index}
          className={classNames(
            "space-between flex w-full items-center border-b border-gray-600 px-6 py-2 text-white",
            {
              "rounded-t-lg": index === 0,
              "bg-primary-500": step === index && loading,
              "rounded-b-lg": index === steps.length,
            }
          )}
        >
          <div className="flex-1">{stepText}</div>
          {step === index && loading && <Spinner />}
          {step > index && <RiCheckFill />}
        </li>
      ))}
    </ul>
  );
}

export default function AddLiquidity() {
  const contract = useContract()!;
  const navigate = useNavigate();
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const [[coinFrom, coinTo], setCoins] = useState<[Coin, Coin]>([
    assets[0],
    assets[1],
  ]);

  const [stage, setStage] = useState(0);
  const { data: poolInfo } = useQuery("PoolPage-poolInfo", () =>
    contract.callStatic.get_info()
  );

  const fromInput = useCoinInput({
    coin: coinFrom,
    onChangeCoin: (coin: Coin) => setCoins([coin, coinTo]),
    gasFee: BigInt(1),
  });

  const toInput = useCoinInput({
    coin: coinTo,
    onChangeCoin: (coin: Coin) => setCoins([coin, coinTo]),
  });

  const addLiquidityMutation = useMutation(
    async () => {
      const fromAmount = fromInput.amount;
      const toAmount = toInput.amount;

      if (!fromAmount || !toAmount) return;

      // TODO: Combine all transactions on single tx leverage by scripts
      // https://github.com/FuelLabs/swayswap-demo/issues/42

      // Deposit coins from
      await contract.functions.deposit({
        forward: [fromAmount, coinFrom.assetId],
      });
      setStage((s) => s + 1);
      // Deposit coins to
      await contract.functions.deposit({
        forward: [toAmount, coinTo.assetId],
      });
      setStage((s) => s + 1);
      // Create liquidity pool
      await contract.functions.add_liquidity(1, toAmount, 1000, {
        variableOutputs: 1,
      });
      setStage((s) => s + 1);
    },
    {
      onSuccess: () => {
        toast.success("New pool created!");
        navigate(Pages.wallet);
      },
      onError: (e: any) => {
        const errors = e?.response?.errors;

        if (errors.length) {
          if (errors[0].message === "enough coins could not be found") {
            toast.error(
              "Not enough balance in your wallet to create this pool."
            );
          }
        }
      },
      onSettled: () => {
        setStage(0);
      },
    }
  );

  const handleCreatePool = () => {
    const fromAmount = fromInput.amount;
    const toAmount = toInput.amount;

    if (!fromAmount) {
      throw new Error('"fromAmount" is required');
    }
    if (!toAmount) {
      throw new Error('"toAmount" is required');
    }

    if (!fromInput.hasEnoughBalance) {
      throw new Error(`Insufficient ${coinFrom.name} balance`);
    }
    if (!toInput.hasEnoughBalance) {
      throw new Error(`Insufficient ${coinTo.name} balance`);
    }

    addLiquidityMutation.mutate();
  };

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  return addLiquidityMutation.isLoading ? (
    <div className="mt-6 mb-8 flex justify-center">
      <PoolLoader
        steps={[
          `Deposit: ${coinFrom.name}`,
          `Deposit: ${coinTo.name}`,
          `Provide liquidity`,
          `Done`,
        ]}
        step={stage}
        loading={addLiquidityMutation.isLoading}
        coinFrom={coinFrom}
        coinTo={coinTo}
      />
    </div>
  ) : (
    <>
      <div className="mt-6 mb-4">
        <CoinInput {...fromInput.getInputProps()} ref={firstInputRef} />
      </div>
      <div className="mb-6">
        <CoinInput {...toInput.getInputProps()} />
      </div>
      {poolInfo ? (
        <div className={style.info}>
          <h4 className="text-white mb-2 font-bold">Reserves</h4>
          <div className="flex">
            <div className="flex flex-col flex-1">
              <span>
                ETH:{" "}
                {formatUnits(poolInfo.eth_reserve, DECIMAL_UNITS).toString()}
              </span>
              <span>
                DAI:{" "}
                {formatUnits(poolInfo.token_reserve, DECIMAL_UNITS).toString()}
              </span>
            </div>
            {poolInfo.eth_reserve > 0 && poolInfo.token_reserve > 0 ? (
              <div className="flex flex-col">
                <span>
                  <>
                    ETH/DAI:{" "}
                    {
                      +(
                        toNumber(ONE_ASSET * poolInfo.eth_reserve) /
                        toNumber(poolInfo.token_reserve) /
                        toNumber(ONE_ASSET)
                      ).toFixed(6)
                    }
                  </>
                </span>
                <span>
                  <>
                    DAI/ETH:{" "}
                    {
                      +(
                        toNumber(ONE_ASSET * poolInfo.token_reserve) /
                        toNumber(poolInfo.eth_reserve) /
                        toNumber(ONE_ASSET)
                      ).toFixed(6)
                    }
                  </>
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <Button
        isDisabled={!fromInput.hasEnoughBalance || !toInput.hasEnoughBalance}
        isFull
        size="lg"
        variant="primary"
        onPress={handleCreatePool}
      >
        {!fromInput.hasEnoughBalance
          ? `Insufficient ${coinFrom.name} balance`
          : !toInput.hasEnoughBalance
          ? `Insufficient ${coinTo.name} balance`
          : "Confirm"}
      </Button>
    </>
  );
}