import crypto from "crypto";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import {
  encryptSymmetric,
} from "@app/components/utilities/cryptography/crypto";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  SecretInput,
  Select,
  SelectItem
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useCreateSharedSecret } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

const expirationUnitsAndActions = [
  {
    unit: "Minutes",
    action: (expiresAt: Date, expiresInValue: number) =>
      expiresAt.setMinutes(expiresAt.getMinutes() + expiresInValue)
  },
  {
    unit: "Hours",
    action: (expiresAt: Date, expiresInValue: number) =>
      expiresAt.setHours(expiresAt.getHours() + expiresInValue)
  },
  {
    unit: "Days",
    action: (expiresAt: Date, expiresInValue: number) =>
      expiresAt.setDate(expiresAt.getDate() + expiresInValue)
  },
  {
    unit: "Weeks",
    action: (expiresAt: Date, expiresInValue: number) =>
      expiresAt.setDate(expiresAt.getDate() + expiresInValue * 7)
  },
  {
    unit: "Months",
    action: (expiresAt: Date, expiresInValue: number) =>
      expiresAt.setMonth(expiresAt.getMonth() + expiresInValue)
  },
  {
    unit: "Years",
    action: (expiresAt: Date, expiresInValue: number) =>
      expiresAt.setFullYear(expiresAt.getFullYear() + expiresInValue)
  }
];

const schema = yup.object({
  name: yup.string().max(100).required().label("Shared Secret Name"),
  value: yup.string().max(1000).required().label("Shared Secret Value"),
  expiresInValue: yup.number().min(1).required().label("Expiration Value"),
  expiresInUnit: yup.string().required().label("Expiration Unit")
});

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["createSharedSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createSharedSecret"]>,
    state?: boolean
  ) => void;
};

export const AddShareSecretModal = ({ popUp, handlePopUpToggle }: Props) => {
  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: yupResolver(schema)
  });
  const createSharedSecret = useCreateSharedSecret();
  const { currentOrg } = useOrganization();
  const [newSharedSecret, setnewSharedSecret] = useState("");
  const hasSharedSecret = Boolean(newSharedSecret);
  const [isUrlCopied, , setIsUrlCopied] = useTimedReset<boolean>({
    initialState: false,
  });

  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(newSharedSecret);
    setIsUrlCopied(true);
  };
  useEffect(() => {
    if (isUrlCopied) {
      setTimeout(() => setIsUrlCopied(false), 2000);
    }
  }, [isUrlCopied]);

  const onFormSubmit = async ({ name, value, expiresInValue, expiresInUnit }: FormData) => {
    try {
      if (!currentOrg?.id) return;

      const key = crypto.randomBytes(16).toString("hex");
      const hashedHex = crypto.createHash("sha256").update(key).digest("hex");
      const { ciphertext, iv, tag } = encryptSymmetric({
        plaintext: value,
        key
      });


      const expiresAt = new Date();
      const updateExpiresAt = expirationUnitsAndActions.find(
        (item) => item.unit === expiresInUnit
      )?.action;
      if (updateExpiresAt) {
        updateExpiresAt(expiresAt, expiresInValue);
      }

      const { id } = await createSharedSecret.mutateAsync({
        name,
        encryptedValue: ciphertext,
        iv,
        tag,
        hashedHex,
        expiresAt,
      });
      setnewSharedSecret(
        `${window.location.origin}/shared/secret/${id}?key=${encodeURIComponent(hashedHex)}-${encodeURIComponent(key)}`
      );

      createNotification({
        text: "Successfully created a shared secret",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      const axiosError = err as AxiosError;
      if (axiosError?.response?.status === 401) {
        createNotification({
          text: "You do not have access to create shared secrets",
          type: "error"
        });
      } else {
        createNotification({
          text: "Failed to create a shared secret",
          type: "error"
        });
      }
    }
  };

  return (
    <Modal
      isOpen={popUp?.createSharedSecret?.isOpen}
      onOpenChange={(open) => {
        handlePopUpToggle("createSharedSecret", open);
        reset();
        setnewSharedSecret("");
      }}
    >
        <ModalContent
          title="Share a Secret"
          subTitle="This link is only accessible once. Please share this link with intended recipients. "
        >
        {!hasSharedSecret ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="name"
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Shared Secret Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="Type your secret identifier" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="value"
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Shared Secret Value"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <SecretInput
                    isVisible
                    {...field}
                    containerClassName="py-1.5 rounded-md transition-all group-hover:mr-2 text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2"
                  />
                </FormControl>
              )}
            />
            <div className="flex w-full flex-row justify-end">
              <div className="w-3/5">
                <Controller
                  control={control}
                  name="expiresInValue"
                  defaultValue={1}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Expiration Value"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="number" min={0} />
                    </FormControl>
                  )}
                />
              </div>
              <div className="w-2/5 pl-4">
                <Controller
                  control={control}
                  name="expiresInUnit"
                  defaultValue={expirationUnitsAndActions[0].unit}
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl
                      label="Expiration Unit"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Select
                        defaultValue={field.value}
                        {...field}
                        onValueChange={(e) => onChange(e)}
                        className="w-full"
                      >
                        {expirationUnitsAndActions.map(({ unit }) => (
                          <SelectItem value={unit} key={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
              </div>
            </div>
            <div className="mt-8 flex items-center">
              <Button
                className="mr-4"
                type="submit"
                isDisabled={isSubmitting}
                isLoading={isSubmitting}
              >
                Create
              </Button>
              <ModalClose asChild>
                <Button variant="plain" colorSchema="secondary">
                  Cancel
                </Button>
              </ModalClose>
            </div>
          </form>
        ) : (
          <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 break-all">{newSharedSecret}</p>
            <IconButton
              ariaLabel="copy icon"
              colorSchema="secondary"
              className="group relative"
              onClick={copyUrlToClipboard}
            >
              <FontAwesomeIcon icon={isUrlCopied ? faCheck : faCopy} />
              <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                Click to Copy
              </span>
            </IconButton>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
