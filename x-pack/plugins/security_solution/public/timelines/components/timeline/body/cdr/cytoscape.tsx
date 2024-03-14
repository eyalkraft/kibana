/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { isEqual } from 'lodash';
import type { CSSProperties, ReactNode } from 'react';
import React, { useContext, createContext, memo, useEffect, useRef, useState } from 'react';
import type { EuiTheme } from '@kbn/kibana-react-plugin/common';
import { ThemeContext } from 'styled-components';
// import { useTraceExplorerEnabledSetting } from '../../../hooks/use_trace_explorer_enabled_setting';
import type { TimelineItem } from '@kbn/timelines-plugin/common';
import { getCytoscapeOptions } from './cytoscape_options';
import { useCytoscapeEventHandlers } from './use_cytoscape_event_handlers';

cytoscape.use(dagre);

export function useTheme(): EuiTheme {
  const theme = useContext(ThemeContext);
  return theme;
}

export const CytoscapeContext = createContext<cytoscape.Core | undefined>(undefined);

export interface CytoscapeProps {
  children?: ReactNode;
  elements: cytoscape.ElementDefinition[];
  height: number;
  serviceName?: string;
  style?: CSSProperties;
}

function useCytoscape(options: cytoscape.CytoscapeOptions) {
  const [cy, setCy] = useState<cytoscape.Core | undefined>(undefined);
  const ref = useRef(null);

  useEffect(() => {
    if (!cy) {
      setCy(cytoscape({ ...options, container: ref.current }));
    }
  }, [options, cy]);

  // Destroy the cytoscape instance on unmount
  useEffect(() => {
    return () => {
      if (cy) {
        cy.destroy();
      }
    };
  }, [cy]);

  return [ref, cy] as [React.MutableRefObject<never>, cytoscape.Core | undefined];
}

function CytoscapeComponent({ children, elements, height, serviceName, style }: CytoscapeProps) {
  const theme = useTheme();
  const isTraceExplorerEnabled = false;
  const [ref, cy] = useCytoscape({
    ...getCytoscapeOptions(theme, isTraceExplorerEnabled),
    elements,
  });
  useCytoscapeEventHandlers({ cy, serviceName, theme });

  // Add items from the elements prop to the cytoscape collection and remove
  // items that no longer are in the list, then trigger an event to notify
  // the handlers that data has changed.
  useEffect(() => {
    if (cy && elements.length > 0) {
      // We do a fit if we're going from 0 to >0 elements
      const fit = cy.elements().length === 0;

      cy.add(elements);
      // Remove any old elements that don't exist in the new set of elements.
      const elementIds = elements.map((element) => element.data.id);
      cy.elements().forEach((element) => {
        if (!elementIds.includes(element.data('id'))) {
          cy.remove(element);
        } else {
          // Doing an "add" with an element with the same id will keep the original
          // element. Set the data with the new element data.
          const newElement = elements.find((el) => el.data.id === element.id());
          element.data(newElement?.data ?? element.data());
        }
      });
      cy.trigger('custom:data', [fit]);
    }
  }, [cy, elements]);

  // Add the height to the div style. The height is a separate prop because it
  // is required and can trigger rendering when changed.
  const divStyle = { ...style, height };

  return (
    <CytoscapeContext.Provider value={cy}>
      <div ref={ref} style={divStyle}>
        {children}
      </div>
    </CytoscapeContext.Provider>
  );
}

export const Cytoscape = memo(CytoscapeComponent, (prevProps, nextProps) => {
  const prevElementIds = prevProps.elements.map((element) => element.data.id).sort();
  const nextElementIds = nextProps.elements.map((element) => element.data.id).sort();

  const propsAreEqual =
    prevProps.height === nextProps.height &&
    prevProps.serviceName === nextProps.serviceName &&
    isEqual(prevProps.style, nextProps.style) &&
    isEqual(prevElementIds, nextElementIds);

  return propsAreEqual;
});

export function convertToCytoscapeElements(data: TimelineItem[]): cytoscape.ElementDefinition[] {
  const elements: cytoscape.ElementDefinition[] = [];

  // remove duplicated data
  data
    .reduce((acc, event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = acc.find((n: any) => {
        return n?.ecs.event.action[0] === event?.ecs?.event?.action?.[0];
      });

      if (!existing) {
        event.occurrences = 0;
        event.alertNodes = [
          {
            data: {
              id: `alert-${event._id}`,
              label: 'Resource Name',
            },
          },
        ];
        acc.push(event);
      } else {
        existing.occurrences += 1;
        existing.alertNodes.push({
          data: {
            id: `alert-${event._id}`,
            label: 'Resource Name',
          },
        });
      }
      return acc;
    }, [])
    .forEach((item) => {
      let userNodeId = '';
      if (item.ecs.user?.name) {
        const userNode = {
          data: {
            id: `user-${item.ecs.user.name[0]}`,
            label: `User: ${item.ecs.user.name[0]}`,
          },
        };
        elements.push(userNode);

        // Todo: Figure out how to add the alert edge
        // item.alertNodes.forEach((alertNode) => {
        //   elements.push(alertNode);
        // });
        elements.push(item.alertNodes[0]);
        // Edge from alert to user
        // TODO: Figure out how to link the edges
        elements.push({
          data: {
            source: userNode.data.id,
            target: item.alertNodes[0].data.id,
            label: `${item.ecs.event?.action[0]} x ${item.occurrences}` || 'Unknown Action',
          },
        });

        userNodeId = userNode.data.id;
      }

      if (item.ecs.source?.ip) {
        const sourceIpNode = {
          data: {
            id: `source-ip-${item.ecs.source.ip[0]}`,
            label: `Source IP: ${item.ecs.source.ip[0]}`,
          },
        };
        elements.push(sourceIpNode);

        const targetId = userNodeId || alertNode.data.id;
        // Edge from alert to source IP
        elements.push({
          data: {
            source: sourceIpNode.data.id,
            target: targetId,
            label: 'Authenticated as',
          },
        });
      }
    });

  return elements;
}
