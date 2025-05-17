import { Checkbox } from "@/components/ui/checkbox";
import { DialogBody, DialogContent, DialogFooter, DialogRoot } from "@/components/ui/dialog";
import {
    Box,
    Button,
    Flex,
    Heading,
    Input,
    Text,
    Wrap,
    WrapItem
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

export type AttributeFilters = Record<string, string[]>;
type NumericRangeFilters = Record<string, [number, number]>;

type Props = {
  onClose: () => void;
  onApplyFilters: (filters: AttributeFilters) => void;
  availableAttributes: Record<string, string[]>;
  currentFilters: AttributeFilters;
  // New props for caching attribute types and ranges
  attributeTypes?: Record<string, 'numeric' | 'categorical'>;
  initialNumericRanges?: NumericRangeFilters;
};

export function AttributeFilterDialog({
  onClose,
  onApplyFilters,
  availableAttributes,
  currentFilters,
  attributeTypes: initialAttributeTypes,
  initialNumericRanges: externalNumericRanges,
}: Props) {
  // Memoize the attribute types calculation to avoid expensive recalculation
  const attributeTypes = useMemo(() => {
    // If attribute types are provided externally, use them
    if (initialAttributeTypes) {
      return initialAttributeTypes;
    }
    
    // Otherwise calculate them
    const typeMap: Record<string, 'numeric' | 'categorical'> = {};
    Object.entries(availableAttributes).forEach(([attribute, values]) => {
      const isNumeric = values.every(value => {
        const trimmedValue = value.trim();
        return trimmedValue === '' || !isNaN(Number(trimmedValue));
      });
      typeMap[attribute] = isNumeric && values.length > 0 ? 'numeric' : 'categorical';
    });
    return typeMap;
  }, [availableAttributes, initialAttributeTypes]);

  // Initialize filters state
  const [filters, setFilters] = useState<AttributeFilters>(currentFilters);

  // Memoize numeric ranges calculations to avoid expensive recalculation
  const calculatedNumericRanges = useMemo(() => {
    // If numeric ranges are provided externally, use them
    if (externalNumericRanges) {
      return externalNumericRanges;
    }
    
    // Otherwise calculate them
    const ranges: NumericRangeFilters = {};
    Object.entries(availableAttributes).forEach(([attribute, values]) => {
      if (attributeTypes[attribute] === 'numeric') {
        const numericValues = values.map(v => v.trim() === '' ? 0 : Number(v));
        ranges[attribute] = [
          Math.min(...numericValues),
          Math.max(...numericValues)
        ];
      }
    });
    return ranges;
  }, [availableAttributes, attributeTypes, externalNumericRanges]);
  // Initialize numeric ranges state with calculated values
  const [numericRanges, setNumericRanges] = useState<NumericRangeFilters>(calculatedNumericRanges);
  
  // 各数値フィルターの有効/無効状態を管理
  const [enabledRanges, setEnabledRanges] = useState<Record<string, boolean>>({});

  // Apply existing filters to numeric ranges if they exist
  useEffect(() => {
    const newEnabledRanges: Record<string, boolean> = {};
    
    Object.entries(filters).forEach(([attribute, selectedValues]) => {
      if (attributeTypes[attribute] === 'numeric' && selectedValues.length > 0) {
        const numValues = selectedValues.map(v => Number(v));
        const minVal = Math.min(...numValues);
        const maxVal = Math.max(...numValues);
        
        // Update the range only if it's different from the current range
        if (numericRanges[attribute]?.[0] !== minVal || numericRanges[attribute]?.[1] !== maxVal) {
          setNumericRanges(prev => ({
            ...prev,
            [attribute]: [minVal, maxVal]
          }));
        }
        
        // このフィルターは有効
        newEnabledRanges[attribute] = true;
      }
    });
    
    setEnabledRanges(newEnabledRanges);
  }, []);  // Only run once on mount

  // Memoize checkbox change handler
  const handleCheckboxChange = useCallback((attribute: string, value: string) => {
    setFilters((prev) => {
      const newFilters = { ...prev };
      if (!newFilters[attribute]) {
        newFilters[attribute] = [];
      }
      
      if (newFilters[attribute].includes(value)) {
        // Remove the value if already selected
        newFilters[attribute] = newFilters[attribute].filter(v => v !== value);
        // Clean up empty arrays
        if (newFilters[attribute].length === 0) {
          delete newFilters[attribute];
        }
      } else {
        // Add the value if not already selected
        newFilters[attribute] = [...newFilters[attribute], value];
      }
      
      return newFilters;
    });
  }, []);

  // Memoize range handlers
  const handleMinRangeChange = useCallback((attribute: string, minValue: number) => {
    const currentRange = numericRanges[attribute] || [0, 0];
    const maxValue = currentRange[1];
    
    // Ensure min is not greater than max
    const newMin = Math.min(minValue, maxValue);
    handleRangeChange(attribute, [newMin, maxValue]);
  }, [numericRanges]);

  const handleMaxRangeChange = useCallback((attribute: string, maxValue: number) => {
    const currentRange = numericRanges[attribute] || [0, 0];
    const minValue = currentRange[0];
    
    // Ensure max is not less than min
    const newMax = Math.max(maxValue, minValue);
    handleRangeChange(attribute, [minValue, newMax]);
  }, [numericRanges]);
  const handleRangeChange = useCallback((attribute: string, range: [number, number]) => {
    setNumericRanges(prev => ({
      ...prev,
      [attribute]: range
    }));
    
    // フィルターが有効な場合のみ更新
    if (enabledRanges[attribute]) {
      // Update filters based on the range
      const availableValues = availableAttributes[attribute] || [];
      const inRangeValues = availableValues.filter(value => {
        const numValue = value.trim() === '' ? 0 : Number(value);
        return numValue >= range[0] && numValue <= range[1];
      });
      
      setFilters(prev => ({
        ...prev,
        [attribute]: inRangeValues
      }));
    }
  }, [availableAttributes, enabledRanges]);

  // Memoize apply handler
  const onApply = useCallback(() => {
    onApplyFilters(filters);
    onClose();
  }, [filters, onApplyFilters, onClose]);
  // Memoize clear filters handler
  const handleClearFilters = useCallback(() => {
    setFilters({});
    // Reset numeric ranges to their original min/max
    setNumericRanges(calculatedNumericRanges);
    // すべてのレンジフィルターを無効化
    setEnabledRanges({});
  }, [calculatedNumericRanges]);
  
  // レンジフィルターの有効/無効を切り替える
  const toggleRangeFilter = useCallback((attribute: string, isEnabled: boolean) => {
    setEnabledRanges(prev => ({
      ...prev,
      [attribute]: isEnabled
    }));
    
    if (isEnabled) {
      // 有効にする場合、現在のレンジでフィルターを適用
      const availableValues = availableAttributes[attribute] || [];
      const range = numericRanges[attribute] || [
        Math.min(...availableValues.map(v => v.trim() === '' ? 0 : Number(v))),
        Math.max(...availableValues.map(v => v.trim() === '' ? 0 : Number(v)))
      ];
      
      const inRangeValues = availableValues.filter(value => {
        const numValue = value.trim() === '' ? 0 : Number(value);
        return numValue >= range[0] && numValue <= range[1];
      });
      
      setFilters(prev => ({
        ...prev,
        [attribute]: inRangeValues
      }));
    } else {
      // 無効にする場合、このフィルターを削除
      setFilters(prev => {
        const newFilters = { ...prev };
        delete newFilters[attribute];
        return newFilters;
      });
    }
  }, [availableAttributes, numericRanges]);
  // Memoize the list of attributes
  const attributeEntries = useMemo(() => 
    Object.entries(availableAttributes), [availableAttributes]
  );

  // Render the dialog content
  return (
    <DialogRoot lazyMount open={true} onOpenChange={onClose}>
      <DialogContent width="80vw" maxWidth="1200px"> {/* 80% of viewport width */}
        <DialogBody>
          <Box mb={6} mt={4}>
            <Heading as="h3" size="md" mb={2}>
              属性フィルター
            </Heading>
            <Text fontSize="sm" mb={5} color="gray.600">
              表示する意見グループを属性で絞り込みます。
            </Text>
            
            {attributeEntries.length === 0 ? (
              <Text fontSize="sm" color="gray.500">
                利用できる属性情報がありません。CSVファイルをアップロードする際に、属性列を選択してください。
              </Text>
            ) : (
              attributeEntries.map(([attribute, values]) => {
                const isNumeric = attributeTypes[attribute] === 'numeric';

                return (
                  <Box key={attribute} mb={6}>
                    <Heading size="sm" mb={2}>
                      {attribute}
                    </Heading>                      {isNumeric && values.length > 0 ? (
                      // Numeric range input
                      <Box pl={2} pr={4} pt={2} borderWidth={1} borderRadius="md" p={3}>
                        <Flex mb={3} align="center">
                          <Checkbox 
                            checked={!!enabledRanges[attribute]} 
                            onChange={() => toggleRangeFilter(attribute, !enabledRanges[attribute])}
                            mr={3}
                          >
                            レンジフィルターを有効にする
                          </Checkbox>
                        </Flex>
                        <Flex gap={2} align="center" mb={3}>
                          <Input 
                            type="number"
                            value={numericRanges[attribute]?.[0] || ''}
                            onChange={(e) => handleMinRangeChange(attribute, Number(e.target.value))}
                            size="sm"
                            width="120px"
                            disabled={!enabledRanges[attribute]}
                          />
                          <Text>～</Text>
                          <Input 
                            type="number"
                            value={numericRanges[attribute]?.[1] || ''}
                            onChange={(e) => handleMaxRangeChange(attribute, Number(e.target.value))}
                            size="sm"
                            width="120px"
                            disabled={!enabledRanges[attribute]}
                          />
                        </Flex>
                        <Flex justify="space-between">
                          <Text fontSize="xs" colorScheme="gray">
                            最小: {Math.min(...values.map(v => v.trim() === '' ? 0 : Number(v)))}
                          </Text>
                          <Text fontSize="xs" colorScheme="gray">
                            最大: {Math.max(...values.map(v => v.trim() === '' ? 0 : Number(v)))}
                          </Text>
                        </Flex>
                      </Box>
                    ) : (
                      // Categorical checkboxes in horizontal layout
                      <Box pl={2}>
                        <Wrap style={{ gap: '8px' }}>
                          {values.map((value) => (
                            <WrapItem key={`${attribute}-${value}`} mb={2} mr={3}>
                              <Box 
                                p={1} 
                                px={2} 
                                borderWidth={1} 
                                borderRadius="md" 
                                bg={filters[attribute]?.includes(value) ? "blue.50" : "transparent"}
                              >
                                <Checkbox 
                                  checked={filters[attribute]?.includes(value) || false}
                                  onChange={() => handleCheckboxChange(attribute, value)}
                                >
                                  {value || '(空)'}
                                </Checkbox>
                              </Box>
                            </WrapItem>
                          ))}
                        </Wrap>
                      </Box>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        </DialogBody>
        <DialogFooter justifyContent="space-between">
          <Button onClick={handleClearFilters} variant="outline" size="sm">
            すべてクリア
          </Button>
          <Button onClick={onApply} colorScheme="blue">設定を適用</Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
