import * as React from 'react';
import isEqual from 'lodash/isEqual';
import classNames from 'classnames';
import { Field, FormInstance } from 'rc-field-form';
import { FieldProps as RcFieldProps } from 'rc-field-form/lib/Field';
import omit from 'omit.js';
import Row from '../grid/row';
import { ConfigContext } from '../config-provider';
import { tuple } from '../_util/type';
import warning from '../_util/warning';
import FormItemLabel, { FormItemLabelProps } from './FormItemLabel';
import FormItemInput, { FormItemInputProps } from './FormItemInput';
import { FormContext, FormItemContext } from './context';
import { toArray, getFieldId } from './util';

const ValidateStatuses = tuple('success', 'warning', 'error', 'validating', '');
export type ValidateStatus = typeof ValidateStatuses[number];

type RenderChildren = (form: FormInstance) => React.ReactElement;

interface FormItemProps extends FormItemLabelProps, FormItemInputProps, RcFieldProps {
  prefixCls?: string;
  noStyle?: boolean;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactElement | RenderChildren;
  id?: string;
  hasFeedback?: boolean;
  validateStatus?: ValidateStatus;
  required?: boolean;

  /** Auto passed by List render props. User should not use this. */
  fieldKey?: number;
}

const FormItem: React.FC<FormItemProps> = (props: FormItemProps) => {
  const {
    name,
    fieldKey,
    noStyle,
    dependencies,
    prefixCls: customizePrefixCls,
    style,
    className,
    shouldUpdate,
    hasFeedback,
    help,
    rules,
    validateStatus,
    children,
    required,
    trigger = 'onChange',
    validateTrigger = 'onChange',
    ...restProps
  } = props;
  const { getPrefixCls } = React.useContext(ConfigContext);
  const formContext = React.useContext(FormContext);
  const { updateItemErrors } = React.useContext(FormItemContext);
  const [domErrorVisible, setDomErrorVisible] = React.useState(false);
  const [inlineErrors, setInlineErrors] = React.useState<Record<string, string[]>>({});

  const { name: formName } = formContext;

  // Cache Field NamePath
  const nameRef = React.useRef<(string | number)[]>([]);

  // Should clean up if Field removed
  React.useEffect(() => {
    return () => {
      updateItemErrors(nameRef.current.join('__SPLIT__'), []);
    };
  }, []);

  const prefixCls = getPrefixCls('form', customizePrefixCls);

  return (
    <Field
      {...props}
      trigger={trigger}
      validateTrigger={validateTrigger}
      onReset={() => {
        setDomErrorVisible(false);
      }}
    >
      {(control, meta, context) => {
        const { errors, name: metaName } = meta;
        const mergedName = toArray(name).length ? metaName : [];

        // ======================== Errors ========================
        // Collect noStyle Field error to the top FormItem
        const updateChildItemErrors = noStyle
          ? updateItemErrors
          : (subName: string, subErrors: string[]) => {
              if (!isEqual(inlineErrors[subName], subErrors)) {
                setInlineErrors({
                  ...inlineErrors,
                  [subName]: subErrors,
                });
              }
            };

        if (noStyle) {
          nameRef.current = [...mergedName];
          if (fieldKey) {
            nameRef.current[nameRef.current.length - 1] = fieldKey;
          }
          updateItemErrors(nameRef.current.join('__SPLIT__'), errors);
        }

        let mergedErrors: React.ReactNode[];
        if (help) {
          mergedErrors = toArray(help);
        } else {
          mergedErrors = errors;
          Object.keys(inlineErrors).forEach(subName => {
            const subErrors = inlineErrors[subName] || [];
            if (subErrors.length) {
              mergedErrors = [...mergedErrors, ...subErrors];
            }
          });
        }

        // ======================== Status ========================
        let mergedValidateStatus: ValidateStatus = '';
        if (validateStatus !== undefined) {
          mergedValidateStatus = validateStatus;
        } else if (meta.validating) {
          mergedValidateStatus = 'validating';
        } else if (!help && mergedErrors.length) {
          mergedValidateStatus = 'error';
        } else if (meta.touched) {
          mergedValidateStatus = 'success';
        }

        // ====================== Class Name ======================
        const itemClassName = {
          [`${prefixCls}-item`]: true,
          [`${prefixCls}-item-with-help`]: domErrorVisible, // TODO: handle this
          [`${className}`]: !!className,

          // Status
          [`${prefixCls}-item-has-feedback`]:
            (mergedValidateStatus && hasFeedback) || mergedValidateStatus === 'validating',
          [`${prefixCls}-item-has-success`]: mergedValidateStatus === 'success',
          [`${prefixCls}-item-has-warning`]: mergedValidateStatus === 'warning',
          [`${prefixCls}-item-has-error`]: mergedValidateStatus === 'error',
          [`${prefixCls}-item-has-error-leave`]:
            !help && domErrorVisible && mergedValidateStatus !== 'error',
          [`${prefixCls}-item-is-validating`]: mergedValidateStatus === 'validating',
        };

        // TODO: Check if user add `required` in RuleRender
        const isRequired =
          required !== undefined
            ? required
            : !!(rules && rules.some(rule => typeof rule === 'object' && rule.required));

        // ======================= Children =======================
        const fieldId = getFieldId(mergedName, formName);
        const mergedControl: typeof control = {
          ...control,
          id: fieldId,
        };

        let childNode;
        if (typeof children === 'function' && (!shouldUpdate || !!name)) {
          warning(false, 'Form.Item', '`children` of render props only work with `shouldUpdate`.');
        } else if (!mergedName.length && !shouldUpdate && !dependencies) {
          childNode = children;
        } else if (React.isValidElement(children)) {
          const childProps = { ...children.props, ...mergedControl };

          // We should keep user origin event handler
          const triggers = new Set<string>();
          [...toArray(trigger), ...toArray(validateTrigger)].forEach(eventName => {
            triggers.add(eventName);
          });

          triggers.forEach(eventName => {
            if (eventName in mergedControl && eventName in children.props) {
              childProps[eventName] = (...args: any[]) => {
                mergedControl[eventName](...args);
                children.props[eventName](...args);
              };
            }
          });

          childNode = React.cloneElement(children, childProps);
        } else if (typeof children === 'function' && shouldUpdate && !name) {
          childNode = children(context);
        }

        if (noStyle) {
          return childNode;
        }

        return (
          <Row
            className={classNames(itemClassName)}
            style={style}
            key="row"
            {...omit(restProps, [
              'id', // It is deprecated because `htmlFor` is its replacement.
              'htmlFor',
              'label',
              'labelAlign',
              'labelCol',
              'wrapperCol',
              'extra',
              'colon',
            ])}
          >
            {/* Label */}
            <FormItemLabel
              htmlFor={fieldId}
              {...props}
              required={isRequired}
              prefixCls={prefixCls}
            />
            {/* Input Group */}
            <FormItemInput
              {...props}
              {...meta}
              errors={mergedErrors}
              prefixCls={prefixCls}
              onDomErrorVisibleChange={setDomErrorVisible}
              validateStatus={mergedValidateStatus}
            >
              <FormItemContext.Provider value={{ updateItemErrors: updateChildItemErrors }}>
                {childNode}
              </FormItemContext.Provider>
            </FormItemInput>
          </Row>
        );
      }}
    </Field>
  );
};

export default FormItem;